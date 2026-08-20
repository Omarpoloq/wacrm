// ============================================================
// POST /api/n8n/event
// ============================================================

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _adminClient: SupabaseClient | null = null;
function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _adminClient;
}

// ---------------- Types ---------------------------------------------------

type N8nEvent =
  | "message_received"
  | "message_sent"
  | "conversation_ended"
  | "funnel_stage_changed"
  | "escalate_human";

interface N8nPayload {
  // Required fields (minimal payload support)
  conversation_id?: string;
  content?: string;
  timestamp?: string;
  
  // Optional but recommended fields
  event?: N8nEvent;
  channel?: "whatsapp" | "instagram";
  contact?: {
    external_id: string;
    name?: string;
    username?: string;
  };
  message?: {
    content?: string;
    direction?: "inbound" | "outbound";
    timestamp?: string;
    message_uuid?: string; // For idempotency
  };
  funnel_stage?: string;
  flow_id?: string;
  metadata?: Record<string, unknown>;
  
  // Idempotency key (can be at root level or in message)
  message_uuid?: string;
}

interface TenantCtx {
  userId: string;
  accountId: string;
}

async function resolveTenantBySecret(
  supabase: SupabaseClient,
  secret: string,
): Promise<TenantCtx | null> {
  // Find the account by the webhook secret
  const { data: account } = await supabase
    .from("accounts")
    .select("id, owner_user_id")
    .eq("n8n_webhook_secret", secret)
    .maybeSingle();
  
  if (!account) {
    return null;
  }
  
  // Get the profile (owner) to get user_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", account.owner_user_id)
    .maybeSingle();
  
  if (!profile) {
    return null;
  }
  
  return {
    userId: profile.user_id,
    accountId: account.id,
  };
}

// Extract message UUID for idempotency
function extractMessageUuid(payload: N8nPayload): string | undefined {
  return payload.message_uuid ?? payload.message?.message_uuid;
}

// Determine sender type based on direction or event
function determineSenderType(payload: N8nPayload): "bot" | "customer" {
  // If explicit direction is provided, use it
  if (payload.message?.direction) {
    return payload.message.direction === "outbound" ? "bot" : "customer";
  }
  // If event is message_sent, it's from bot
  if (payload.event === "message_sent") {
    return "bot";
  }
  // If event is message_received, it's from customer
  if (payload.event === "message_received") {
    return "customer";
  }
  // Default to bot for minimal payloads (assuming bot-to-provider flow)
  return "bot";
}

// Extract content from payload (supports both flat and nested structures)
function extractContent(payload: N8nPayload): string | undefined {
  return payload.content ?? payload.message?.content;
}

// Extract timestamp from payload
function extractTimestamp(payload: N8nPayload): Date {
  const ts = payload.timestamp ?? payload.message?.timestamp;
  if (ts) {
    const parsed = new Date(ts);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

// Extract channel from payload with sensible default
function extractChannel(payload: N8nPayload): "whatsapp" | "instagram" {
  return payload.channel ?? "whatsapp";
}

// Extract contact info with defaults
function extractContactInfo(payload: N8nPayload, conversationId?: string): { externalId: string; name?: string } {
  if (payload.contact?.external_id) {
    return {
      externalId: payload.contact.external_id,
      name: payload.contact.name,
    };
  }
  // Fallback: try to derive from conversation_id or use a placeholder
  // This allows minimal payloads to work
  return {
    externalId: conversationId ?? `unknown-${Date.now()}`,
    name: undefined,
  };
}

// ---------------- Handler -------------------------------------------------

export async function POST(request: Request) {
  try {
    // -- Auth: shared secret from accounts table (multi-tenant) ------------
    const secret = request.headers.get("x-n8n-secret");
    if (!secret) {
      return NextResponse.json({ error: "Unauthorized: missing secret" }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    
    // Resolve tenant by secret (finds account and owner user_id)
    const tenant = await resolveTenantBySecret(supabase, secret);
    if (!tenant) {
      return NextResponse.json({ error: "Unauthorized: invalid secret" }, { status: 401 });
    }

    // -- Parse payload ------------------------------------------------------
    let payload: N8nPayload;
    try {
      payload = (await request.json()) as N8nPayload;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    // -- Idempotency check (early return if duplicate) ----------------------
    const messageUuid = extractMessageUuid(payload);
    
    if (messageUuid) {
      const { data: existingMsg } = await supabase
        .from("messages")
        .select("id")
        .eq("metadata->>message_uuid", messageUuid)
        .maybeSingle();
      
      if (existingMsg) {
        return NextResponse.json({
          ok: true,
          idempotent: true,
          message_id: existingMsg.id,
          message: "Duplicate message ignored",
        });
      }
    }

    // -- Validate minimal required fields -----------------------------------
    // At minimum we need either content or conversation_id to proceed
    const content = extractContent(payload);
    if (!content && !payload.conversation_id) {
      return NextResponse.json(
        { error: "Missing required fields: either 'content' or 'conversation_id' must be provided" },
        { status: 400 },
      );
    }

    // -- Extract common fields ----------------------------------------------
    const channel = extractChannel(payload);
    const senderType = determineSenderType(payload);
    const timestamp = extractTimestamp(payload).toISOString();
    const flowId = payload.flow_id ?? payload.metadata?.flow_id ?? null;

    // -- 1. Resolve or create contact ---------------------------------------
    let contactId: string;
    const { externalId, name } = extractContactInfo(payload, payload.conversation_id);
    const phonedigits = externalId.replace(/\D/g, "");

    // Try to find existing contact (scoped by account_id)
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id, name")
      .eq("account_id", tenant.accountId)
      .or(`external_id.eq.${externalId},phone.eq.${externalId},phone_normalized.eq.${phonedigits}`)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
      
      // Update contact name if we have one and it's not set
      if (name && !existingContact.name) {
        await supabase
          .from("contacts")
          .update({ name })
          .eq("id", contactId);
      }
    } else {
      // Create new contact
      const { data: created, error: insertErr } = await supabase
        .from("contacts")
        .insert({
          user_id: tenant.userId,
          account_id: tenant.accountId,
          phone: externalId,
          phone_normalized: phonedigits || null,
          name: name ?? null,
          channel,
          external_id: externalId,
          funnel_stage: payload.funnel_stage ?? "nuevo",
        })
        .select("id")
        .single();

      if (insertErr) {
        // Race condition: re-check
        const { data: fallback } = await supabase
          .from("contacts")
          .select("id")
          .eq("account_id", tenant.accountId)
          .or(`external_id.eq.${externalId},phone.eq.${externalId},phone_normalized.eq.${phonedigits}`)
          .maybeSingle();

        if (fallback) {
          contactId = fallback.id;
        } else {
          console.error("[n8n/event] contact insert failed:", JSON.stringify(insertErr));
          return NextResponse.json(
            { error: "Failed to resolve contact", detail: insertErr.message },
            { status: 500 },
          );
        }
      } else {
        contactId = created.id;
      }
    }

    // -- 2. Resolve or create conversation ----------------------------------
    let conversationId: string | undefined = payload.conversation_id;

    // If conversation_id provided, verify it belongs to this account
    if (conversationId) {
      const { data: convCheck } = await supabase
        .from("conversations")
        .select("id, contact_id")
        .eq("id", conversationId)
        .eq("account_id", tenant.accountId)
        .maybeSingle();
      
      if (!convCheck) {
        conversationId = undefined;
      } else if (convCheck.contact_id !== contactId) {
        // Conversation exists but for different contact - create new one
        conversationId = undefined;
      }
    }

    if (!conversationId) {
      // Find existing conversation for this contact (scoped by account_id)
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id, bot_active")
        .eq("account_id", tenant.accountId)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        // Create new conversation
        const { data: createdConv, error: convErr } = await supabase
          .from("conversations")
          .insert({
            user_id: tenant.userId,
            account_id: tenant.accountId,
            contact_id: contactId,
            channel,
            bot_active: true,
            assigned_flow_id: flowId,
          })
          .select("id")
          .single();

        if (convErr) {
          if (convErr.code === "23505") {
            // Race condition: find the conversation that won
            const { data: re } = await supabase
              .from("conversations")
              .select("id")
              .eq("account_id", tenant.accountId)
              .eq("contact_id", contactId)
              .maybeSingle();
            if (re) conversationId = re.id;
          } else {
            console.error("[n8n/event] conversation insert failed:", convErr);
          }
        } else {
          conversationId = createdConv.id;
        }
      }
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: "Failed to resolve conversation" },
        { status: 500 },
      );
    }

    // -- 3. Persist the message (if content provided) -----------------------
    let messageId: string | undefined;
    
    if (content) {
      // Prepare metadata with message_uuid for idempotency
      const messageMetadata: Record<string, unknown> = {};
      if (messageUuid) {
        messageMetadata.message_uuid = messageUuid;
      }
      if (payload.metadata) {
        Object.assign(messageMetadata, payload.metadata);
      }

      const { data: msgData, error: msgErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_type: senderType,
          ai_generated: senderType === "bot",
          content_type: "text",
          content_text: content,
          created_at: timestamp,
          metadata: Object.keys(messageMetadata).length > 0 ? messageMetadata : null,
        })
        .select("id")
        .single();

      if (msgErr) {
        console.error("[n8n/event] message insert failed:", msgErr);
      } else {
        messageId = msgData.id;
      }
    }

    // -- 4. Event-specific side effects -------------------------------------
    if (payload.event === "funnel_stage_changed" && payload.funnel_stage) {
      await supabase
        .from("contacts")
        .update({ funnel_stage: payload.funnel_stage })
        .eq("id", contactId);
    }

    if (payload.event === "escalate_human") {
      await supabase
        .from("conversations")
        .update({ bot_active: false })
        .eq("id", conversationId);
    }

    if (payload.event === "conversation_ended") {
      await supabase
        .from("conversations")
        .update({ bot_active: false })
        .eq("id", conversationId);
    }

    return NextResponse.json({
      ok: true,
      conversation_id: conversationId,
      contact_id: contactId,
      message_id: messageId,
      sender_type: senderType,
    });

  } catch (err) {
    console.error("[n8n/event] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}