// src/app/api/instagram/webhook/route.ts
import { NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isUniqueViolation } from '@/lib/contacts/dedupe';

// Lazy Supabase admin client
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
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256') || '';

  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (appSecret && signature) {
    const crypto = await import('crypto');
    const parts = signature.split('=');
    if (parts.length === 2 && parts[0] === 'sha256') {
      const expected = crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[1]))) {
        console.warn('[Instagram webhook] Invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
      }
    }
  } else {
    console.warn('[Instagram webhook] No app secret or signature, skipping verification (development mode)');
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
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
async function processInstagramWebhook(body: any) {
  if (body.object !== 'instagram') {
    console.log('[Instagram webhook] Ignored event (not instagram)');
    return;
  }

  for (const entry of body.entry || []) {
    const instagramBusinessId = entry.id;

    for (const event of entry.messaging || []) {
      if (!event.message) continue;
      // Ignorar echoes (mensajes que nosotros enviamos, Meta los refleja al webhook)
      if (event.message.is_echo) continue;
      const senderId = event.sender.id;
      const recipientId = event.recipient.id;
      const timestamp = event.timestamp;
      const message = event.message;

      // 1. Obtener configuración de Instagram desde la base de datos
      const { data: config, error: configError } = await supabaseAdmin()
        .from('instagram_config')
        .select('account_id, user_id')
        .eq('instagram_business_id', recipientId)
        .maybeSingle();

      if (configError || !config) {
        console.error(`[Instagram] No config found for business id: ${recipientId}`, configError);
        continue;
      }

      const accountId = config.account_id;
      const userId = config.user_id;

      // 2. Buscar o crear contacto
      const contactOutcome = await findOrCreateInstagramContact(
        senderId,
        accountId,
        userId
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
        const mediaId = firstAtt.payload?.id;
        if (mediaId) {
          mediaUrl = await getInstagramMediaUrl(mediaId);
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

      console.log(`[Instagram] Message processed: ${messageId} for contact ${contact.id}`);
    }
  }
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

async function getInstagramMediaUrl(mediaId: string): Promise<string | null> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    console.warn('[Instagram] No access token for media');
    return null;
  }
  try {
    const url = `https://graph.facebook.com/v20.0/${mediaId}?fields=url&access_token=${token}`;
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

async function findOrCreateInstagramContact(
  externalId: string,
  accountId: string,
  userId: string,
  name?: string
): Promise<{ contact: any; wasCreated: boolean } | null> {
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
    // Actualizar datos si cambió (nombre, avatar, username)
    let updateData: any = { updated_at: new Date().toISOString() };
    if (name && name !== existing.name) updateData.name = name;
    // Si queremos actualizar también el username, lo haríamos, pero por simplicidad no.
    return { contact: existing, wasCreated: false };
  }

  // Si no existe, obtener datos del perfil desde Meta
  let profileName = name || `User ${externalId.slice(-4)}`;
  let username = null;
  let avatarUrl = null;

  try {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN;
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${externalId}?fields=name,username,profile_pic&access_token=${token}`
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
      if (raced) return { contact: raced, wasCreated: false };
    }
    console.error('[Instagram] Error creating contact:', createError);
    return null;
  }

  return { contact: newContact, wasCreated: true };
}

async function findOrCreateInstagramConversation(
  contactId: string,
  accountId: string,
  userId: string
): Promise<{ conversation: any; created: boolean } | null> {
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
    return { conversation: existing, created: false };
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
      if (raced) return { conversation: raced, created: false };
    }
    console.error('[Instagram] Error creating conversation:', createError);
    return null;
  }

  return { conversation: newConv, created: true };
}