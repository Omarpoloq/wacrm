// src/app/api/instagram/webhook/route.ts
import { NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import { dispatchInboundToN8n } from '@/lib/n8n/dispatchInboundToN8n';

// Type definitions for Instagram webhook payload
// No longer used - keeping type for potential future use
// interface InstagramProfile {
//   id: string;
//   name?: string;
//   username?: string;
//   profile_pic?: string;
// }

interface InstagramAttachment {
  type: string;
  payload?: {
    url?: string;
    id?: string;
    caption?: string;
  };
}

interface InstagramMessage {
  mid: string;
  text?: string;
  attachments?: InstagramAttachment[];
  is_echo?: boolean;
}

interface InstagramEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message: InstagramMessage;
}

interface InstagramEntry {
  id: string;
  messaging?: InstagramEvent[];
}

interface InstagramWebhookBody {
  object: string;
  entry: InstagramEntry[];
}

// Lazy Supabase admin client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _adminClient;
}

export const maxDuration = 60;

// GET - Webhook verification
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN || 'InstagramSolventa';

  if (mode === 'subscribe' && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Verification failed', { status: 403 });
}

// POST - Receive messages
export async function POST(request: Request) {
  // DEBUG: log all headers Meta sends. If Meta is gzip/deflate/br-ing
  // the body, Next.js's request.text() should still give us the
  // decoded bytes, but if a proxy in front decompressed and re-encoded
  // the body, the bytes our HMAC sees won't match what Meta HMAC'd.
  // Logging content-encoding + transfer-encoding lets us spot that.
  const allHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    allHeaders[key] = value;
  });
  
 /* console.log('[Instagram webhook] inbound headers', {
    'content-encoding': request.headers.get('content-encoding'),
    'content-length': request.headers.get('content-length'),
    'transfer-encoding': request.headers.get('transfer-encoding'),
    'content-type': request.headers.get('content-type'),
    'user-agent': request.headers.get('user-agent'),
    'x-hub-signature-256': request.headers.get('x-hub-signature-256'),
    all_headers: allHeaders,
  }); */

  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256') || '';

  // TEMPORARY: try every secret available in env, including the
  // Instagram sub-app secret. We compute HMAC with each one against
  // the raw body and log which (if any) matches the signature Meta
  // sent. This is purely diagnostic — once we know the winning secret,
  // narrow the list back down to just it.
  //
  // SKIP MODE: when INSTAGRAM_SKIP_SIGNATURE is explicitly 'true',
  // we accept any signature (or no signature) so the rest of the
  // inbound flow can be validated end-to-end. We still log every
  // candidate's HMAC so we can spot the correct secret from the
  // server logs.
  const skipSignature = process.env.INSTAGRAM_SKIP_SIGNATURE === 'true';

  // Collect every candidate secret we want to try. Order is
  // arbitrary — we compute all of them and report which matches.
  const candidateMap: Record<string, string | undefined> = {
    INSTAGRAM_WEBHOOK_SECRET: process.env.INSTAGRAM_WEBHOOK_SECRET,
    INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET,
    INSTAGRAM_VERIFY_TOKEN: process.env.INSTAGRAM_VERIFY_TOKEN,
    META_APP_SECRET: process.env.META_APP_SECRET,
  };

  const candidates = Object.entries(candidateMap).filter(
    (entry): entry is [string, string] => Boolean(entry[1] && entry[1].length > 0),
  );

  if (skipSignature) {
    console.warn(
      '[Instagram webhook] SIGNATURE CHECK SKIPPED — INSTAGRAM_SKIP_SIGNATURE=true',
    );
  }

  if (signature && candidates.length > 0) {
    const crypto = await import('crypto');
    const parts = signature.split('=');
    if (parts.length === 2 && parts[0] === 'sha256') {
      const receivedBuf = Buffer.from(parts[1]);

      // Compute HMAC with every candidate secret and log which one
      // matches. This is the diagnostic block — if none match, the
      // log tells us which prefixes are *close* to the right answer.
      const attemptSummaries = candidates.map(([envName, secret]) => {
        const expected = crypto
          .createHmac('sha256', secret)
          .update(rawBody)
          .digest('hex');
        const expectedBuf = Buffer.from(expected);
        const matched =
          expectedBuf.length === receivedBuf.length &&
          crypto.timingSafeEqual(expectedBuf, receivedBuf);
        return {
          env: envName,
          secret_prefix: secret.slice(0, 4),
          secret_length: secret.length,
          signature_computed_prefix: expected.slice(0, 8) + '…',
          matched,
        };
      });

      const matchedAttempt = attemptSummaries.find((a) => a.matched);
      const matchedEnvVar = matchedAttempt?.env ?? null;

     

      if (!skipSignature) {
        if (!matchedEnvVar) {
          console.warn('[Instagram webhook] Invalid signature (no candidate matched)');
          return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
        }
      }
    }
  } else if (!skipSignature) {
    console.warn('[Instagram webhook] No app secret or signature, skipping verification (development mode)');
  }

  let body: InstagramWebhookBody;
  try {
    body = JSON.parse(rawBody) as InstagramWebhookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  after(async () => {
    try {
      await processInstagramWebhook(body);
    } catch (error) {
      console.error('Error processing Instagram webhook:', error);
    }
  });

  return NextResponse.json({ status: 'received' }, { status: 200 });
}

// ============================================================
// PROCESADOR PRINCIPAL
// ============================================================
async function processInstagramWebhook(body: InstagramWebhookBody) {
  if (body.object !== 'instagram') {
    console.log('[Instagram webhook] Ignored event (not instagram)');
    return;
  }

  for (const entry of body.entry) {
    for (const event of entry.messaging || []) {
      if (!event.message) continue;
      // Ignorar echoes (mensajes que nosotros enviamos, Meta los refleja al webhook)
      if (event.message.is_echo) continue;
      const senderId = event.sender.id;
      const recipientId = event.recipient.id;
      const timestamp = event.timestamp;
      const message = event.message;

      // 1. Obtener configuración de Instagram desde la base de datos
      //
      // The webhook's `event.recipient.id` is the **Facebook Page ID**
      // (not the Instagram User ID we get from /me). The OAuth flow now
      // populates `page_id` with that Page ID and `instagram_business_id`
      // with the linked Business Account ID. We match on either so the
      // lookup works regardless of which ID Meta echoes in the event.
      const { data: config, error: configError } = await supabaseAdmin()
        .from('instagram_config')
        .select('account_id, user_id, access_token')
        .or(`instagram_business_id.eq.${recipientId},page_id.eq.${recipientId}`)
        .maybeSingle();

      if (configError || !config) {
        console.error(`[Instagram] No config found for recipient id: ${recipientId}`, configError);
        continue;
      }

      const accountId = config.account_id;
      const userId = config.user_id;
      const accessToken = config.access_token;

      // 2. Buscar o crear contacto
      const contactOutcome = await findOrCreateInstagramContact(
        senderId,
        accountId,
        userId,
        accessToken
      );
      if (!contactOutcome) {
        console.error(`[Instagram] Failed to find/create contact for sender ${senderId}`);
        continue;
      }
      const contact = contactOutcome.contact;

      // 3. Buscar o crear conversación
      const convResult = await findOrCreateInstagramConversation(
        contact.id,
        accountId,
        userId
      );
      if (!convResult) {
        console.error(`[Instagram] Failed to find/create conversation for contact ${contact.id}`);
        continue;
      }
      const conversation = convResult.conversation;

      // 4. Extraer datos del mensaje
      const messageId = message.mid;
      const text = message.text || null;
      const attachments = message.attachments || [];

      let contentType = 'text';
      let mediaUrl: string | null = null;
      let contentText: string | null = text;

      if (attachments.length > 0) {
        const firstAtt = attachments[0];
        contentType = firstAtt.type || 'file';

        // Mapear tipos de Instagram a tipos válidos
        const typeMap: Record<string, string> = {
          'ig_reel': 'video',
          'ig_story': 'image',
          share: 'image',
        };
        contentType = typeMap[contentType] || contentType;

        const directUrl = firstAtt.payload?.url || null;
        const mediaId = firstAtt.payload?.id || null;

        if (directUrl) {
          // Intentar descargar y subir a Storage
          try {
            const res = await fetch(directUrl);
            if (res.ok) {
              const buffer = Buffer.from(await res.arrayBuffer());
              const contentTypeHeader = res.headers.get('content-type') || 'image/jpeg';
              const mimeMap: Record<string, string> = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/webp': 'webp',
                'video/mp4': 'mp4',
                'audio/ogg': 'ogg',
                'audio/mpeg': 'mp3',
              };
              const ext = mimeMap[contentTypeHeader] || 'bin';
              const fileKey = mediaId || Date.now().toString();
              const path = `instagram/${fileKey}.${ext}`;

              const { error: uploadError } = await supabaseAdmin()
                .storage
                .from('chat-media')
                .upload(path, buffer, { contentType: contentTypeHeader, upsert: true });

              if (!uploadError) {
                const { data } = supabaseAdmin().storage.from('chat-media').getPublicUrl(path);
                mediaUrl = data.publicUrl;
              } else {
                console.error('[Instagram] Error subiendo media:', uploadError);
                mediaUrl = directUrl; // fallback
              }
            }
          } catch (err) {
            console.error('[Instagram] Error descargando media:', err);
            mediaUrl = directUrl; // fallback
          }
        } else if (mediaId) {
          mediaUrl = await getInstagramMediaUrl(mediaId, accessToken);
        }

        if (firstAtt.payload?.caption) {
          contentText = firstAtt.payload.caption;
        }
      }

      // 5. Insertar mensaje
      const { error: msgError } = await supabaseAdmin()
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          sender_type: 'customer',
          content_type: contentType,
          content_text: contentText || `[${contentType}]`,
          media_url: mediaUrl,
          message_id: messageId,
          status: 'delivered',
          created_at: new Date(timestamp).toISOString(),
          channel: 'instagram',
        });

      if (msgError) {
        console.error('[Instagram] Error inserting message:', msgError);
        continue;
      }

      // 6. Actualizar conversación
      await supabaseAdmin()
        .from('conversations')
        .update({
          last_message_text: contentText || `[${contentType}]`,
          last_message_at: new Date().toISOString(),
          unread_count: (conversation.unread_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation.id);

      // ============================================================
      // n8n dispatch — Instagram doesn't have internal flows, so always fire.
      // Fire-and-forget with .catch() so errors never block the webhook.
      // ============================================================
      const n8nPayload = {
        event_type: 'message_received' as const,
        channel: 'instagram' as const,
        conversation_id: conversation.id,
        contact_id: contact.id,
        message_id: messageId,
        content: contentText ?? '',
        content_type: contentType,
        media_url: mediaUrl,
        sender_type: 'customer' as const,
        account_id: accountId,
        contact: {
          external_id: senderId, // Instagram user ID
          name: contact.name ?? `User ${senderId.slice(-4)}`,
          channel: 'instagram',
        },
      };
      dispatchInboundToN8n(accountId, n8nPayload).catch((err) =>
        console.error('[n8n] Instagram dispatch failed:', err),
      );

     // console.log(`[Instagram] Message processed: ${messageId} for contact ${contact.id}`);
    }
  }
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

async function getInstagramMediaUrl(mediaId: string, token?: string): Promise<string | null> {
  const accessToken = token ?? process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn('[Instagram] No access token for media');
    return null;
  }
  try {
    // Use the new graph.instagram.com endpoint
    const url = `https://graph.instagram.com/v20.0/${mediaId}?fields=url&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[Instagram] Failed to fetch media url:', await res.text());
      return null;
    }
    const data = await res.json();
    return data.url || null;
  } catch (error) {
    console.error('[Instagram] Error fetching media:', error);
    return null;
  }
}

interface ContactRow {
  id: string;
  account_id: string;
  user_id: string;
  external_id: string;
  channel: string;
  name: string | null;
  phone: string;
  company: string | null;
  avatar_url: string | null;
  updated_at: string;
  [key: string]: unknown;
}

async function findOrCreateInstagramContact(
  externalId: string,
  accountId: string,
  userId: string,
  accessToken?: string,
  name?: string
): Promise<{ contact: ContactRow; wasCreated: boolean } | null> {
  const supabase = supabaseAdmin();

  // Buscar existente
  const { data: existing, error: findError } = await supabase
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .eq('external_id', externalId)
    .eq('channel', 'instagram')
    .maybeSingle();

  if (findError) {
    console.error('[Instagram] Error finding contact:', findError);
    return null;
  }

  if (existing) {
    const row = existing as ContactRow;
    // Actualizar datos si cambió (nombre, avatar, username)
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name && name !== row.name) updateData.name = name;
    // Si queremos actualizar también el username, lo haríamos, pero por simplicidad no.
    return { contact: row, wasCreated: false };
  }

  // Si no existe, obtener datos del perfil desde Meta
  let profileName = name || `User ${externalId.slice(-4)}`;
  let username = null;
  let avatarUrl = null;

  try {
    const token = accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN;
    const res = await fetch(
      `https://graph.instagram.com/v20.0/${externalId}?fields=name,username,profile_pic&access_token=${token}`
    );
    if (res.ok) {
      const data = await res.json();
      profileName = data.name || profileName;
      username = data.username || null;
      avatarUrl = data.profile_pic || null;
      console.log(`[Instagram] Perfil obtenido: name="${profileName}", username="${username}"`);
    } else {
      console.warn(`[Instagram] No se pudo obtener perfil para ${externalId}:`, await res.text());
    }
  } catch (error) {
    console.warn('[Instagram] Error fetching profile:', error);
  }

  // Insertar contacto
  const { data: newContact, error: createError } = await supabase
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: userId,
      external_id: externalId,
      channel: 'instagram',
      name: profileName,
      phone: externalId, // obligatorio NOT NULL
      // Guardamos el username en la columna 'company' (no se usa para Instagram)
      company: username ? `@${username}` : null,
      avatar_url: avatarUrl,
    })
    .select()
    .single();

  if (createError) {
    if (isUniqueViolation(createError)) {
      const { data: raced } = await supabase
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .eq('external_id', externalId)
        .eq('channel', 'instagram')
        .maybeSingle();
      if (raced) return { contact: raced as ContactRow, wasCreated: false };
    }
    console.error('[Instagram] Error creating contact:', createError);
    return null;
  }

  return { contact: newContact as ContactRow, wasCreated: true };
}

interface ConversationRow {
  id: string;
  account_id: string;
  user_id: string;
  contact_id: string;
  channel: string;
  status: string;
  unread_count: number;
  last_message_at: string;
  updated_at: string;
  [key: string]: unknown;
}

async function findOrCreateInstagramConversation(
  contactId: string,
  accountId: string,
  userId: string
): Promise<{ conversation: ConversationRow; created: boolean } | null> {
  // Ajusta el valor de 'status' según tu esquema ('open' o 'active')
  const STATUS = 'open'; // cambia a 'active' si tu tabla usa ese valor

  const { data: existing, error: findError } = await supabaseAdmin()
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .eq('channel', 'instagram')
    .eq('status', STATUS)
    .maybeSingle();

  if (findError) {
    console.error('[Instagram] Error finding conversation:', findError);
    return null;
  }

  if (existing) {
    return { conversation: existing as ConversationRow, created: false };
  }

  const { data: newConv, error: createError } = await supabaseAdmin()
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: userId,
      contact_id: contactId,
      channel: 'instagram',
      status: STATUS,
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (createError) {
    if (isUniqueViolation(createError)) {
      const { data: raced } = await supabaseAdmin()
        .from('conversations')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .eq('channel', 'instagram')
        .eq('status', STATUS)
        .maybeSingle();
      if (raced) return { conversation: raced as ConversationRow, created: false };
    }
    console.error('[Instagram] Error creating conversation:', createError);
    return null;
  }

  return { conversation: newConv as ConversationRow, created: true };
}