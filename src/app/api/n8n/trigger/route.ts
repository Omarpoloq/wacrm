// ============================================================
// POST /api/n8n/trigger
//
// Fires an n8n flow's webhook from inside the dashboard. A signed-in
// agent calls this to hand a conversation to a configured n8n flow
// (e.g. pressing "Send to bot"), and the flow executes its webhook_url.
//
// Unlike `/api/n8n/event` (which n8n calls INTO us with a shared
// secret), this endpoint is called FROM the browser, so it requires an
// authenticated Supabase session and resolves the caller's account via
// `profiles`.
//
// Flow resolution is account-scoped: only flows owned by the caller's
// account can be triggered.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
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

    // Resolve account_id (post-017 tenancy). Teammates who didn't
    // author the flow row must still be able to trigger it, so we scope
    // by account_id, not user_id.
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

    // -- Parse body ---------------------------------------------------------
    let body: { flow_id?: string; conversation_id?: string; payload?: object };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const { flow_id: flowId, conversation_id: conversationId, payload } = body;

    if (!flowId || typeof flowId !== "string") {
      return NextResponse.json(
        { error: "'flow_id' (string) is required" },
        { status: 400 },
      );
    }
    if (!conversationId || typeof conversationId !== "string") {
      return NextResponse.json(
        { error: "'conversation_id' (string) is required" },
        { status: 400 },
      );
    }

    // -- 1. Resolve the flow (account-scoped) -------------------------------
    const { data: flow, error: flowErr } = await supabase
      .from("n8n_flows")
      .select("id, name, webhook_url, is_active")
      .eq("id", flowId)
      .eq("account_id", accountId)
      .maybeSingle();

    if (flowErr || !flow) {
      return NextResponse.json(
        { error: "Flow not found" },
        { status: 404 },
      );
    }

    if (!flow.is_active) {
      return NextResponse.json(
        { error: "Flow is inactive" },
        { status: 400 },
      );
    }

    // Guard: prevent SSRF — only allow http(s) URLs.
    let url: URL;
    try {
      url = new URL(flow.webhook_url);
    } catch {
      return NextResponse.json(
        { error: "Flow has an invalid webhook_url" },
        { status: 500 },
      );
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return NextResponse.json(
        { error: "Flow webhook_url must be http(s)" },
        { status: 500 },
      );
    }

    // -- 2. POST to the flow's webhook --------------------------------------
    const sendBody: Record<string, unknown> = {
      flow_id: flowId,
      conversation_id: conversationId,
      ...(payload ?? {}),
    };

    let upstream: Response;
    try {
      upstream = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sendBody),
        // Don't hang a dashboard request on a slow n8n flow.
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      console.error("[n8n/trigger] upstream fetch failed:", err);
      return NextResponse.json(
        { error: "Failed to reach the n8n flow webhook" },
        { status: 502 },
      );
    }

    // -- 3. Return the webhook's response -----------------------------------
    let upstreamBody: unknown = null;
    try {
      upstreamBody = await upstream.json();
    } catch {
      upstreamBody = await upstream.text();
    }

    return NextResponse.json(
      {
        ok: upstream.ok,
        status: upstream.status,
        response: upstreamBody,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[n8n/trigger] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}