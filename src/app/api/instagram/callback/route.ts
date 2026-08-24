// src/app/api/instagram/callback/route.ts
//
// OAuth callback for the **Instagram Platform** Login flow (NOT the
// legacy Facebook-Graph dialog). The endpoints, scopes and token
// format differ from Facebook's OAuth:
//
//   - Dialog:        https://www.instagram.com/oauth/authorize
//   - Code→token:    https://api.instagram.com/oauth/access_token
//   - Long-lived:    https://graph.instagram.com/access_token
//   - Account info:  https://graph.instagram.com/me?fields=...
//
// The token we end up storing is an *Instagram User access token*
// (NOT a Page access token). It's the credential the rest of the
// project passes to graph.instagram.com endpoints to send DMs and
// look up the linked Business Account.
//
// Flow:
//   1. User clicks "Connect Instagram" → we mint a CSRF state,
//      stash it in an httpOnly cookie, and redirect to Instagram's
//      authorize URL.
//   2. Instagram redirects back with `?code=...&state=...`.
//   3. We validate state (one-shot), then POST the code to
//      api.instagram.com/oauth/access_token to get a short-lived
//      token, then exchange that for a long-lived token via
//      graph.instagram.com/access_token.
//   4. We call /me?fields=id,name,instagram_business_account to
//      resolve the user's Instagram ID (stored as page_id) and
//      the linked Business Account ID (stored as
//      instagram_business_id).
//   5. Upsert instagram_config for the caller's account and
//      redirect to /settings?instagram=connected.
//
// Env vars required (already in .env.local):
//   - INSTAGRAM_APP_ID       — the App ID Meta gave us (1041455398470581).
//   - INSTAGRAM_APP_SECRET   — used for the code→token exchange.
//   - NEXT_PUBLIC_SITE_URL   — origin used to build the redirect_uri.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

const INSTAGRAM_OAUTH_DIALOG = 'https://www.instagram.com/oauth/authorize'
const INSTAGRAM_CODE_EXCHANGE = 'https://api.instagram.com/oauth/access_token'
const INSTAGRAM_LONG_LIVED_EXCHANGE = 'https://graph.instagram.com/access_token'
const INSTAGRAM_GRAPH_ME = 'https://graph.instagram.com/me'

// The redirect_uri MUST match the one registered with Meta and the
// one in the authorization URL byte-for-byte. We hardcode it here
// (rather than building it from `NEXT_PUBLIC_SITE_URL`) so that:
//   1. The popup doesn't see a different `Host`/`Origin` than the
//      production server and trip a same-origin check.
//   2. The code exchange doesn't get rejected for "redirect_uri
//      mismatch" when a user hits the callback from an unusual
//      referrer (e.g. preview tool, staging share).
// If you need a localhost/dev variant, add a NODE_ENV branch here.
const REDIRECT_URI = 'https://crm.solventaia.co/api/instagram/callback'

function getOrigin(request: Request): string {
  // Prefer the explicit canonical URL — same precedence the rest of
  // the project uses (see `.env.local` comments). Fall back to the
  // request's own origin so local dev (no env var) still works.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl) return siteUrl.replace(/\/+$/, '')
  return new URL(request.url).origin
}

function randomState(): string {
  // 32 bytes → 64 hex chars. Sufficient entropy for a CSRF token;
  // round-tripped in a SameSite=Lax httpOnly cookie that the
  // browser sends back on the redirect.
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * GET /api/instagram/callback
 *
 * Two modes:
 *   - With `?code` and `?state` → redirect-back from Instagram.
 *     Exchange the code, persist the config, redirect to
 *     /settings?instagram=connected.
 *   - Without those params → user clicked "Connect Instagram". Mint
 *     a state, stash it in a cookie, redirect to Instagram's
 *     authorize URL.
 *
 * Keeping both modes on the same path means the redirect_uri
 * registered with Meta stays stable at
 *   ${NEXT_PUBLIC_SITE_URL}/api/instagram/callback
 * regardless of whether the request is "start" or "finish".
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  const settingsUrl = (suffix = '') =>
    `${getOrigin(request)}/settings${suffix ? `?${suffix}` : ''}`

  // ============================================================
  // MODE 1 — start the OAuth flow
  // ============================================================
  if (!code) {
    // Instagram can short-circuit with `?error=...&error_description=...`
    // if the user denies the dialog. Surface that back to settings
    // instead of starting a fresh flow they'd have to re-decline.
    if (errorParam) {
      return NextResponse.redirect(
        `${settingsUrl('instagram=error')}&reason=${encodeURIComponent(
          errorParam,
        )}&detail=${encodeURIComponent(errorDescription ?? '')}`,
      )
    }

    const appId = process.env.INSTAGRAM_APP_ID
    if (!appId) {
      console.error('[Instagram OAuth] INSTAGRAM_APP_ID is not configured')
      return NextResponse.redirect(
        `${settingsUrl('instagram=error')}&reason=config_missing&detail=INSTAGRAM_APP_ID`,
      )
    }

    const stateToken = randomState()
    // Authorization URL — built by literal concatenation so it matches
    // the exact format Meta gave us (the same query string that produces
    // "Invalid platform app" if it gets reformatted by a serializer).
    // The ONLY dynamic piece is `state`, which we append at the end so
    // everything upstream stays byte-for-byte identical to the
    // Meta-provided URL.
    //
    // If we ever need to change `redirect_uri` (e.g. for a localhost
    // dev variant) or `client_id`, update the literal below — do NOT
    // switch back to `new URLSearchParams` or any helper that might
    // reorder or re-encode the params.
    const dialogUrl =
      `${INSTAGRAM_OAUTH_DIALOG}` +
      `?force_reauth=true` +
      `&client_id=1041455398470581` +
      `&redirect_uri=https://crm.solventaia.co/api/instagram/callback` +
      `&response_type=code` +
      `&scope=instagram_business_basic%2Cinstagram_business_manage_messages%2Cinstagram_business_manage_comments%2Cinstagram_business_content_publish%2Cinstagram_business_manage_insights` +
      `&state=${stateToken}`

    const cookieStore = await cookies()
    // httpOnly so JS can't read it; SameSite=Lax so it survives the
    // cross-site redirect from instagram.com back to us; ~10 min
    // window is plenty for the round-trip.
    cookieStore.set('ig_oauth_state', stateToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/instagram/callback',
      maxAge: 60 * 10,
    })

    return NextResponse.redirect(dialogUrl)
  }

  // ============================================================
  // MODE 2 — finish the OAuth flow
  // ============================================================

  // ----- 2a. CSRF check -----
  const cookieStore = await cookies()
  const expectedState = cookieStore.get('ig_oauth_state')?.value
  // One-shot: clear the cookie as soon as we read it so a replay
  // of the same callback URL can't be used to overwrite the config
  // a second time.
  cookieStore.set('ig_oauth_state', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/instagram/callback',
    maxAge: 0,
  })

  if (!expectedState || !state || expectedState !== state) {
    console.warn('[Instagram OAuth] state mismatch or missing cookie')
    return NextResponse.redirect(
      `${settingsUrl('instagram=error')}&reason=state_mismatch`,
    )
  }

  // ----- 2b. Auth + tenancy -----
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.redirect(
      `${settingsUrl('instagram=error')}&reason=unauthenticated`,
    )
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profileError || !profile?.account_id) {
    console.error(
      '[Instagram OAuth] no profile/account_id for user',
      user.id,
      profileError,
    )
    return NextResponse.redirect(
      `${settingsUrl('instagram=error')}&reason=no_account`,
    )
  }
  const accountId = profile.account_id as string

  // ----- 2c. Exchange code → short-lived access_token -----
  //
  // instagram.com/oauth/access_token accepts the standard form
  // POST (client_id, client_secret, grant_type=authorization_code,
  // redirect_uri, code). Returns a ~1h access_token.
  const appId = process.env.INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  if (!appId || !appSecret) {
    console.error(
      '[Instagram OAuth] INSTAGRAM_APP_ID or INSTAGRAM_APP_SECRET missing',
    )
    return NextResponse.redirect(
      `${settingsUrl('instagram=error')}&reason=config_missing`,
    )
  }

  const redirectUri = REDIRECT_URI

  let shortToken: string
  try {
    // The body is form-encoded so it stays byte-identical to what
    // Meta expects (and what their docs/SDKs use). Don't switch to
    // JSON — api.instagram.com/oauth/access_token does not accept
    // JSON bodies for this grant type.
    const exchangeForm = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    })

    // DEBUG: log exactly what we're sending to Meta. The 4-char
    // prefix of client_secret is enough to confirm we have *some*
    // secret wired up without leaking the full value to the logs.
    // Remove this block once the "Invalid platform app" issue is
    // resolved — it's diagnostic only.
    console.log('[Instagram OAuth] code exchange request', {
      endpoint: INSTAGRAM_CODE_EXCHANGE,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: {
        client_id: appId,
        client_secret_prefix: appSecret.slice(0, 4) + '…',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_prefix: code.slice(0, 8) + '…',
      },
      rawBody: exchangeForm.toString(),
    })

    const tokenRes = await fetch(INSTAGRAM_CODE_EXCHANGE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: exchangeForm.toString(),
    })
    const tokenJson: {
      access_token?: string
      user_id?: number
      error_type?: string
      error_message?: string
      code?: number
    } = await tokenRes.json()
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error(
        '[Instagram OAuth] code exchange failed',
        tokenRes.status,
        tokenJson,
      )
      return NextResponse.redirect(
        `${settingsUrl('instagram=error')}&reason=token_exchange&detail=${encodeURIComponent(
          tokenJson.error_message ?? `HTTP ${tokenRes.status}`,
        )}`,
      )
    }
    shortToken = tokenJson.access_token
  } catch (err) {
    console.error('[Instagram OAuth] code exchange threw', err)
    return NextResponse.redirect(
      `${settingsUrl('instagram=error')}&reason=token_exchange_failed`,
    )
  }

  // ----- 2d. Exchange short-lived → long-lived token -----
  //
  // graph.instagram.com/access_token?grant_type=ig_exchange_token
  // upgrades a short-lived token to a ~60-day one. The endpoint
  // takes client_secret + access_token as *query* params (unlike
  // the short-lived exchange which is a form POST). Both webhook
  // routing and the /me lookup assume a long-lived token, so we
  // always run this step. A failure here is non-fatal — the
  // short-lived token is still usable, it'll just expire in ~1h.
  let longToken = shortToken
  try {
    const exchangeParams = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: appSecret,
      access_token: shortToken,
    })
    const exRes = await fetch(
      `${INSTAGRAM_LONG_LIVED_EXCHANGE}?${exchangeParams.toString()}`,
    )
    const exJson: {
      access_token?: string
      token_type?: string
      expires_in?: number
      error_type?: string
      error_message?: string
    } = await exRes.json()
    if (exRes.ok && exJson.access_token) {
      longToken = exJson.access_token
    } else {
      console.warn(
        '[Instagram OAuth] long-lived exchange failed; using short-lived token',
        exRes.status,
        exJson,
      )
    }
  } catch (err) {
    console.warn('[Instagram OAuth] long-lived exchange threw', err)
  }

  // ----- 2e. Resolve Facebook Page ID + Instagram Business ID -----
  //
  // Even though the OAuth dialog is the Instagram Platform one, Meta
  // still routes webhook events for an Instagram Business account by
  // the *Facebook Page* that owns it. So `event.recipient.id` in the
  // webhook is the Page ID, not the Instagram User ID returned by
  // `/me` on the Instagram graph.
  //
  // To make the webhook's `WHERE instagram_business_id = recipientId OR
  // ----- 2e. Resolve Instagram Business ID -----
  //
  // Call graph.instagram.com/me with the long-lived token. We request
  // BOTH `id` (the Instagram-scoped ID) and `user_id` (the cross-product
  // ID that Instagram webhooks echo as `recipient.id`).
  //
  //   - `id`         → Instagram-scoped User ID. Persisted in `page_id`
  //                    as a reference for anything that needs the
  //                    platform-native identifier later.
  //   - `user_id`    → the ID the webhook delivers as `recipient.id`
  //                    (e.g. 17841405826106817). Persisted in
  //                    `instagram_business_id` so the webhook's
  //                    `OR page_id, instagram_business_id` lookup
  //                    finds the row on the first inbound event.
  let instagramBusinessId: string | null = null
  let pageId: string | null = null
  try {
    const meUrl =
      `${INSTAGRAM_GRAPH_ME}?fields=id,name,username,user_id` +
      `&access_token=${encodeURIComponent(longToken)}`
    const meRes = await fetch(meUrl)
    const meJson: {
      id?: string | number
      name?: string
      username?: string
      user_id?: string | number
      error?: { message: string; type?: string; code?: number }
      error_type?: string
      error_message?: string
    } = await meRes.json()
    if (!meRes.ok || (!meJson.id && !meJson.user_id)) {
      console.error('[Instagram OAuth] /me failed', meRes.status, meJson)
      const msg =
        meJson.error?.message ??
        meJson.error_message ??
        `HTTP ${meRes.status}`
      return NextResponse.redirect(
        `${settingsUrl('instagram=error')}&reason=pages_list&detail=${encodeURIComponent(msg)}`,
      )
    }
    // `user_id` is the webhook key. Fall back to `id` for older apps
    // that don't return `user_id` yet, so we don't break existing
    // configurations.
    instagramBusinessId =
      meJson.user_id != null ? String(meJson.user_id) : String(meJson.id)
    pageId = meJson.id != null ? String(meJson.id) : null
  } catch (err) {
    console.error('[Instagram OAuth] /me threw', err)
    return NextResponse.redirect(
      `${settingsUrl('instagram=error')}&reason=pages_list_failed`,
    )
  }

  // ----- 2e.bis Subscribe the app to webhook events -----
  //
  // Required by Meta: after connecting an Instagram account via
  // the Business Login flow, we MUST explicitly subscribe the app
  // to the webhook fields we want to receive. Without this call
  // Meta will sign webhook deliveries using the App Secret but
  // never actually deliver them to our endpoint.
  //
  // Endpoint: POST https://graph.instagram.com/v24.0/{ig_business_id}/subscribed_apps
  //   ?subscribed_fields=messages,messaging_seen,messaging_reactions
  //   &access_token=<long_lived_token>
  //
  // Failure here is NON-FATAL — the user can still finish onboarding
  // and we'll log it so we can debug if webhooks don't arrive later.
  // Meta sometimes returns 200 with `{ success: false }` if the app is
  // already subscribed, which we treat as success.
  const SUBSCRIBED_FIELDS = 'messages,messaging_seen,message_reactions,message_edit'
  try {
    const subscribeUrl =
      `https://graph.instagram.com/v24.0/${instagramBusinessId}/subscribed_apps` +
      `?subscribed_fields=${encodeURIComponent(SUBSCRIBED_FIELDS)}` +
      `&access_token=${encodeURIComponent(longToken)}`
    const subRes = await fetch(subscribeUrl, { method: 'POST' })
    const subJson: {
      success?: boolean
      error?: { message: string; type?: string; code?: number }
      error_type?: string
      error_message?: string
    } = await subRes.json().catch(() => ({}))
    if (subRes.ok && subJson.success !== false) {
      console.log(
        '[Instagram OAuth] subscribed_apps OK',
        {
          instagram_business_id: instagramBusinessId,
          subscribed_fields: SUBSCRIBED_FIELDS.split(','),
          response_status: subRes.status,
        },
      )
    } else {
      console.warn(
        '[Instagram OAuth] subscribed_apps failed (non-fatal)',
        {
          instagram_business_id: instagramBusinessId,
          status: subRes.status,
          error: subJson.error?.message ?? subJson.error_message ?? subJson,
        },
      )
    }
  } catch (err) {
    console.warn('[Instagram OAuth] subscribed_apps threw (non-fatal)', err)
  }

  // ----- 2f. Persist into instagram_config -----
  //
  // Upsert by (account_id, instagram_business_id) — matches the
  // existing UNIQUE constraint so reconnecting the same account
  // overwrites in place. If the user reconnects a *different*
  // business account, we update the row's identifiers too —
  // there's only one Instagram config per account in this schema.
  const { error: upsertError } = await supabase
    .from('instagram_config')
    .upsert(
      {
        account_id: accountId,
        user_id: user.id,
        instagram_business_id: instagramBusinessId,
        page_id: pageId,
        access_token: longToken,
        app_id: appId,
        app_secret: appSecret,
        status: 'connected',
        connected_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,instagram_business_id' },
    )

  if (upsertError) {
    console.error(
      '[Instagram OAuth] failed to upsert instagram_config',
      upsertError,
    )
    return NextResponse.redirect(
      `${settingsUrl('instagram=error')}&reason=db_write_failed`,
    )
  }

  return NextResponse.redirect(settingsUrl('instagram=connected'))
}
