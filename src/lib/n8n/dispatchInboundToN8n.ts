import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Payload shape sent to n8n when an inbound message is received
 * and NOT consumed by the internal CRM flows engine.
 */
export interface N8nInboundPayload {
  event_type: 'message_received'
  channel: 'whatsapp' | 'instagram'
  conversation_id: string
  contact_id: string
  message_id: string
  content: string
  content_type: string
  media_url: string | null
  sender_type: 'customer'
  account_id: string
  contact: {
    external_id: string
    name: string
    channel: string
  }
}

// Lazy, shared service-role client for n8n dispatch.
// Mirrors src/lib/flows/admin-client.ts and src/lib/automations/admin-client.ts
let _adminClient: SupabaseClient | null = null

function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

/**
 * Dispatch an inbound message to the account's configured n8n webhook.
 * Best-effort: errors are logged but not thrown, so the main webhook flow
 * is never interrupted.
 */
export async function dispatchInboundToN8n(
  accountId: string,
  payload: N8nInboundPayload
): Promise<void> {
  try {
    // Fetch n8n webhook configuration for this account
    const { data: account, error } = await supabaseAdmin()
      .from('accounts')
      .select('n8n_webhook_url, n8n_webhook_secret')
      .eq('id', accountId)
      .maybeSingle()

    if (error) {
      console.error('[n8n] Error fetching account config:', error.message)
      return
    }

    if (!account?.n8n_webhook_url) {
      // No webhook configured for this account — silently skip
      // Optional: console.log('[n8n] No webhook URL configured for account:', accountId)
      return
    }

    const webhookUrl = account.n8n_webhook_url
    const webhookSecret = account.n8n_webhook_secret

    // Fire the request — don't await so it doesn't block the webhook response
    // Use .catch() to handle errors without throwing
    fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret ? { 'x-n8n-secret': webhookSecret } : {}),
      },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.error('[n8n] Webhook dispatch failed:', err instanceof Error ? err.message : String(err))
    })
  } catch (err) {
    // Catch any unexpected errors (e.g., Supabase client issues)
    console.error('[n8n] dispatchInboundToN8n unexpected error:', err instanceof Error ? err.message : String(err))
  }
}