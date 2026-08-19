// ============================================================
// GET /api/n8n/check-bot
//
// Endpoint for n8n to check if a bot is active for a given
// contact (phone + channel). Returns bot_active state and
// the current conversation id if one exists.
//
// Auth
//   Header `x-n8n-secret` must match an account's `n8n_webhook_secret`.
//   The secret identifies the tenant (account).
// ============================================================

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy singleton so the env var isn't read at build time.
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

interface CheckBotResponse {
  bot_active: boolean;
  conversation_id: string | null;
  funnel_stage?: string | null;
}

// ---------------- Handler -------------------------------------------------

export async function GET(request: Request) {
  try {
    // -- Auth: shared secret from accounts table (multi-tenant) ------------
    const secret = request.headers.get("x-n8n-secret");
    if (!secret) {
      return NextResponse.json({ error: "Unauthorized: missing secret" }, { status: 401 });
    }

    const supabase = supabaseAdmin();

    // Resolve account by secret
    const { data: account, error: accountErr } = await supabase
      .from("accounts")
      .select("id, owner_user_id")
      .eq("n8n_webhook_secret", secret)
      .maybeSingle();

    if (accountErr) {
      console.error("[n8n/check-bot] account lookup failed:", accountErr);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    if (!account) {
      return NextResponse.json({ error: "Unauthorized: invalid secret" }, { status: 401 });
    }

    const accountId = account.id;

    // -- Parse query params -------------------------------------------------
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get("phone");
    const channel = searchParams.get("channel");

    if (!phone || !channel) {
      return NextResponse.json(
        { error: "Missing required query params: phone, channel" },
        { status: 400 },
      );
    }

    // -- 1. Find the contact (scoped by account_id) -------------------------
    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("id")
      .eq("account_id", accountId)
      .eq("external_id", phone)
      .eq("channel", channel)
      .maybeSingle();

    if (contactErr) {
      console.error("[n8n/check-bot] contact lookup failed:", contactErr);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    // -- 2. No contact found ------------------------------------------------
    if (!contact) {
      const response: CheckBotResponse = {
        bot_active: true,
        conversation_id: null,
      };
      return NextResponse.json(response);
    }

    // -- 3. Find the most recent conversation for this contact --------------
    const { data: conversation, error: convErr } = await supabase
      .from("conversations")
      .select("id, bot_active, funnel_stage")
      .eq("account_id", accountId)
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (convErr) {
      console.error("[n8n/check-bot] conversation lookup failed:", convErr);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    // -- 4. No conversation found -------------------------------------------
    if (!conversation) {
      const response: CheckBotResponse = {
        bot_active: true,
        conversation_id: null,
      };
      return NextResponse.json(response);
    }

    // -- 5. Conversation found ----------------------------------------------
    const response: CheckBotResponse = {
      bot_active: conversation.bot_active ?? true,
      conversation_id: conversation.id,
      funnel_stage: conversation.funnel_stage ?? null,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[n8n/check-bot] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}