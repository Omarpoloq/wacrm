// src/lib/oauth/openPopup.ts
//
// Open an OAuth provider's authorization URL in a centered popup
// instead of a full-page navigation. Watches the popup and resolves
// when it closes with the callback URL on our own origin.
//
// Why polling instead of postMessage:
//   Meta's OAuth dialog does not run any JS we control, so the
//   popup can't postMessage back. We can only observe it from the
//   parent by checking `popup.closed` and reading its `location`
//   *once it has navigated back to our origin* (cross-origin
//   `location` reads throw SecurityError — that's how we know the
//   popup is still on instagram.com / facebook.com and not done).
//
// This is the same pattern GitHub, Linear, etc. use for their
// "connect account" popups — there isn't a more standard option
// without forcing the OAuth provider to ship custom JS.

const DEFAULT_WIDTH = 600
const DEFAULT_HEIGHT = 720
// Polling cadence: cheap enough to feel instant when the popup
// closes, infrequent enough to be invisible in DevTools.
const POLL_INTERVAL_MS = 400
// Give up after 5 minutes — long enough that a slow user on Meta's
// 2FA / OTP flow can finish, short enough that a zombie popup
// doesn't keep the parent listening forever.
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

export interface OAuthPopupResult {
  /** 'success' if the callback carried our success flag, 'error' otherwise. */
  status: 'success' | 'error' | 'closed'
  /** The `reason` query param the callback set on error. Undefined on success. */
  reason?: string
  /** The `detail` query param the callback set on error. */
  detail?: string
  /** Whether the popup actually opened (false = pop-up blocked). */
  opened: boolean
}

/**
 * Open a popup at `authUrl`, watch it until it lands back on
 * `parentOrigin`, and resolve with the parsed query string.
 *
 * On pop-up blocker: resolves with `{ status: 'error', opened: false }`
 * so the caller can fall back to a full-page redirect.
 *
 * On timeout: resolves with `{ status: 'closed', opened: true }`. The
 * caller should probably re-check the connection status rather than
 * treat it as success.
 */
export function openOAuthPopup(
  authUrl: string,
  options: {
    name?: string
    width?: number
    height?: number
    timeoutMs?: number
    /** Origin the popup must land on for the parent to read its URL. */
    parentOrigin?: string
  } = {},
): Promise<OAuthPopupResult> {
  const name = options.name ?? 'oauth'
  const width = options.width ?? DEFAULT_WIDTH
  const height = options.height ?? DEFAULT_HEIGHT
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const parentOrigin =
    options.parentOrigin ??
    (typeof window !== 'undefined' ? window.location.origin : '')

  // Compute centered coordinates. Falls back to 0,0 on
  // environments without `screen` (e.g. some test runners) so the
  // popup is at least visible.
  // Use window.screenX/Y (standard) and fall back to screenLeft/Top
  // for older browsers.
  const screenLeft =
    typeof window !== 'undefined'
      ? window.screenX ?? window.screenLeft ?? 0
      : 0
  const screenTop =
    typeof window !== 'undefined'
      ? window.screenY ?? window.screenTop ?? 0
      : 0
  const viewWidth =
    typeof window !== 'undefined'
      ? window.innerWidth
      : typeof screen !== 'undefined'
        ? screen.width
        : width
  const viewHeight =
    typeof window !== 'undefined'
      ? window.innerHeight
      : typeof screen !== 'undefined'
        ? screen.height
        : height
  const left = screenLeft + Math.max(0, (viewWidth - width) / 2)
  const top = screenTop + Math.max(0, (viewHeight - height) / 2)

  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'status=no',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',')

  const popup = window.open(authUrl, name, features)

  if (!popup) {
    // Pop-up blocker / disabled popups. Surface back to the caller
    // so it can fall back to a full-page redirect.
    return Promise.resolve({ status: 'error', opened: false })
  }

  try {
    popup.focus()
  } catch {
    // Some browsers throw if the popup isn't ready yet — non-fatal.
  }

  return new Promise((resolve) => {
    let resolved = false
    let intervalId: ReturnType<typeof setInterval> | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const finish = (result: OAuthPopupResult) => {
      if (resolved) return
      resolved = true
      if (intervalId) clearInterval(intervalId)
      if (timeoutId) clearTimeout(timeoutId)
      resolve(result)
    }

    timeoutId = setTimeout(() => {
      // Don't close the popup on the user's behalf — just give up
      // listening. They can finish or close it themselves; the
      // status check will reflect whatever they actually completed.
      finish({ status: 'closed', opened: true })
    }, timeoutMs)

    intervalId = setInterval(() => {
      // Popup closed by the user (or by the callback via
      // window.close after self.close()). We don't have a URL to
      // read in that case — the caller should re-fetch status
      // from the server and treat it as authoritative.
      if (popup.closed) {
        finish({ status: 'closed', opened: true })
        return
      }

      // Try to read the popup's current URL. This throws a
      // SecurityError as long as the popup is on a cross-origin
      // page (instagram.com / facebook.com during the dialog) —
      // which is exactly the "still in progress" signal we want.
      let href: string | null = null
      try {
        href = popup.location.href
      } catch {
        // Cross-origin — popup is still on the provider's site.
        return
      }

      if (!href) return

      // Make sure the popup has actually landed on us before we
      // trust the URL. (Belt-and-braces — the try/catch above
      // already guarantees same-origin, but a future bug there
      // would silently hand us a misleading URL.)
      let parsed: URL
      try {
        parsed = new URL(href)
      } catch {
        return
      }
      if (parsed.origin !== parentOrigin) return

      const flag = parsed.searchParams.get('instagram')
      if (!flag) {
        // User landed back on our origin but the URL doesn't carry
        // the flag yet (mid-redirect?). Keep polling.
        return
      }

      // Got the result — close the popup proactively so the user
      // doesn't have to. We swallow the close error in case some
      // browsers reject it for cross-window reasons.
      try {
        popup.close()
      } catch {
        // ignore
      }

      if (flag === 'connected') {
        finish({ status: 'success', opened: true })
      } else if (flag === 'error') {
        finish({
          status: 'error',
          opened: true,
          reason: parsed.searchParams.get('reason') ?? undefined,
          detail: parsed.searchParams.get('detail') ?? undefined,
        })
      } else {
        finish({ status: 'closed', opened: true })
      }
    }, POLL_INTERVAL_MS)
  })
}