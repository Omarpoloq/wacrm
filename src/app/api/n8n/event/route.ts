// ============================================================
// POST /api/n8n/event
//
// Ingest endpoint for n8n chatbot flows. n8n calls this whenever a
// chatbot conversation produces an event worth persisting —
// an inbound/outbound message, a funnel-stage change, an AI escalation
// to a human, etc. It mirrors the server-side persistence the WhatsApp
// webhook performs, but is deliberately channel-agnostic: n8n tells us
// the channel (`whatsapp` | `instagram`) and whether the message is
// inbound or outbound.
//
// Why the service-role client?
//   n8n posts here from a server with a shared secret (`x-n8n-secret`),
//   NOT from an authenticated browser session. We therefore cannot rely
//   on Supabase Auth (no session cookies) and must use the admin client,
//   exactly like `src/app/api/whatsapp/webhook/route.ts`. RLS is bypassed,
//   so every write below must be scoped explicitly by account/user —
//   there is no auth.uid() to save us.
//
// Auth
//   Header `x-n8n-secret` must equal `N8N_WEBHOOK_SECRET`.
// ============================================================

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/whatsapp/phone-utils";

// Lazy singleton so the env var isn't read at build time (matches the
// pattern in the WhatsApp webhook).
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
  event: N8nEvent;
  channel: "whatsapp" | "instagram";
  contact: {
    external_id: string;
    name?: string;
    username?: string;
  };
  conversation_id?: string;
  message?: {
    content?: string;
    direction?: "inbound" | "outbound";
    timestamp?: string;
  };
  funnel_stage?: string;
  flow_id?: string;
  metadata?: Record<string, unknown>;
}

// External webhooks can't resolve `user_id` / `account_id` from a session.
// The shared secret identifies *which* tenant this webhook belongs to, so
// we derive the owning account from the `profiles` table. `user_id` is the
// profile's row owner; `account_id` is its tenancy key (post-017).
interface TenantCtx {
  userId: string;
  accountId: string;
}

async function resolveTenant(
  supabase: SupabaseClient,
  fallbackUserId?: string,
): Promise<TenantCtx | null> {
  if (fallbackUserId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, account_id")
      .eq("user_id", fallbackUserId)
      .maybeSingle();
    if (profile?.account_id) {
      return { userId: profile.user_id, accountId: profile.account_id as string };
    }
  }
  // Fall back to the first profile that has an account (single-tenant
  // setups / bootstrapping). Prefer an admin-owned account.
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, account_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (profile?.account_id) {
    return { userId: profile.user_id, accountId: profile.account_id as string };
  }
  return null;
}

// ---------------- Handler -------------------------------------------------

export async function POST(request: Request) {
  try {
    // -- Auth: shared secret ------------------------------------------------
    const secret = request.headers.get("x-n8n-secret");
    if (!secret || secret !== process.env.N8N_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    if (!payload.event || !payload.channel || !payload.contact?.external_id) {
      return NextResponse.json(
        { error: "Missing required fields: event, channel, contact.external_id" },
        { status: 400 },
      );
    }

    const supabase = supabaseAdmin();

    // Resolve the owning tenant. `metadata.user_id` lets n8n pin a
    // specific tenant; otherwise we fall back to the admin profile.
    const metadataUserId =
      typeof payload.metadata?.user_id === "string"
        ? (payload.metadata.user_id as string)
        : undefined;
    const tenant = await resolveTenant(supabase, metadataUserId);
    if (!tenant) {
      return NextResponse.json(
        { error: "No tenant could be resolved for this webhook" },
        { status: 500 },
      );
    }

    // -- 1. Find or create the contact --------------------------------------
    // Contacts are account-scoped post-022/017. We look up by
    // (account_id, channel, external_id). If the column set differs on the
    // live DB, `external_id` may be absent; we still try, and fall back to
    // phone-normalized lookup when available.
    const externalId = payload.contact.external_id;
    const channel = payload.channel;
    let contactId: string;
    let phoneNormalized: string | null = null;

    try {
      phoneNormalized = normalizePhone(externalId);
    } catch {
      phoneNormalized = null;
    }

    const { data: existingContact, error: contactErr } = await supabase
      .from("contacts")
      .select("id, external_id, channel")
      .eq("account_id", tenant.accountId)
      .or(`external_id.eq.${externalId},channel.eq.${channel}`)
      .maybeSingle();

    if (contactErr && contactErr.code !== "PGRST116") {
      console.error("[n8n/event] contact lookup failed:", contactErr);
    }

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const insertPayload: Record<string, unknown> = {
        user_id: tenant.userId,
        account_id: tenant.accountId,
        phone: externalId,
        name: payload.contact.name ?? null,
        channel,
        external_id: externalId,
        funnel_stage: payload.funnel_stage ?? "nuevo",
      };
      if (phoneNormalized) insertPayload.phone_normalized = phoneNormalized;

      const { data: created, error: insertErr } = await supabase
        .from("contacts")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertErr) {
        // Unique-violation race (022 / 036): another write created the row
        // between our SELECT and INSERT. Re-resolve instead of failing.
        if (insertErr.code === "23505") {
          const { data: re } = await supabase
            .from("contacts")
            .select("id")
            .eq("account_id", tenant.accountId)
            .eq("external_id", externalId)
            .maybeSingle();
          if (re) {
            contactId = re.id;
          } else {
            return NextResponse.json(
              { error: "Failed to create contact (duplicate)" },
              { status: 409 },
            );
          }
        } else {
          console.error("[n8n/event] contact insert failed:", insertErr);
          return NextResponse.json(
            { error: "Failed to create contact" },
            { status: 500 },
          );
        }
      } else {
        contactId = created.id;
      }
    }

    // -- 2. Find or create the conversation ---------------------------------
    let conversationId: string | undefined = payload.conversation_id;

    if (conversationId) {
      // Confirm it belongs to this account so a forged id can't leak
      // another tenant's thread.
      const { data: convCheck } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("account_id", tenant.accountId)
        .maybeSingle();
      if (!convCheck) conversationId = undefined;
    }

    if (!conversationId) {
      // One conversation per (account, contact) — migration 036.
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
        const { data: createdConv, error: convErr } = await supabase
          .from("conversations")
          .insert({
            user_id: tenant.userId,
            account_id: tenant.accountId,
            contact_id: contactId,
            channel,
            bot_active: true,
            assigned_flow_id: payload.flow_id ?? null,
          })
          .select("id")
          .single();

        if (convErr) {
          if (convErr.code === "23505") {
            const { data: re } = await supabase
              .from("conversations")
              .select("id")
              .eq("account_id", tenant.accountId)
              .eq("contact_id", contactId)
              .maybeSingle();
            if (re) conversationId = re.id;
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

    // -- 3. Persist the message (if present) --------------------------------
    if (payload.message?.content) {
      const direction = payload.message.direction ?? "inbound";
      const timestamp = payload.message.timestamp
        ? new Date(payload.message.timestamp).toISOString()
        : new Date().toISOString();

      const { error: msgErr } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_type: direction === "outbound" ? "bot" : "customer",
        content_type: "text",
        content_text: payload.message.content,
        created_at: timestamp,
      });
      if (msgErr) {
        console.error("[n8n/event] message insert failed:", msgErr);
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

    return NextResponse.json({
      ok: true,
      conversation_id: conversationId,
      contact_id: contactId,
    });
  } catch (err) {
    console.error("[n8n/event] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}