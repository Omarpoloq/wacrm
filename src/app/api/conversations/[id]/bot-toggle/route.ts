// ============================================================
// PATCH /api/conversations/[id]/bot-toggle
//
// Activates / deactivates the n8n chatbot for a single conversation.
// Called from the inbox thread header (`BotToggle` component). Requires
// an authenticated session; the conversation is resolved account-scoped
// so a teammate can toggle a conversation they didn't personally open.
//
// Body: { bot_active: boolean }
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const supabase = await createClient();

    // -- Auth: active session ----------------------------------------------
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve account_id for cross-member scoping (post-017).
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const accountId = profile?.account_id as string | undefined;
    if (!accountId) {
      return NextResponse.json(
        { error: "Your profile is not linked to an account." },
        { status: 403 },
      );
    }

    const params = await context.params;
    const conversationId = params.id;

    // -- Body validation ----------------------------------------------------
    let body: { bot_active?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (typeof body.bot_active !== "boolean") {
      return NextResponse.json(
        { error: "'bot_active' must be a boolean" },
        { status: 400 },
      );
    }

    // -- Update (account-scoped) --------------------------------------------
    const { data, error } = await supabase
      .from("conversations")
      .update({ bot_active: body.bot_active })
      .eq("id", conversationId)
      .eq("account_id", accountId)
      .select("id, bot_active")
      .maybeSingle();

    if (error || !data) {
      // RLS would also hide rows we can't see; a 404 is the safe,
      // info-free response either way.
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ bot_active: data.bot_active });
  } catch (err) {
    console.error("[bot-toggle] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}