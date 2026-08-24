// src/app/api/instagram/config/route.ts
//
// GET  → returns the current Instagram config status for the
//        caller's account. Used by <InstagramConfig /> to decide
//        between the "connected" and "connect" states on load, and
//        to power the Settings Overview tile.
// DELETE → clears the saved row so the user can re-connect.
//          Mirrors the DELETE on /api/whatsapp/config.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { connected: false, reason: 'no_account' },
        { status: 200 },
      )
    }

    const { data, error } = await supabase
      .from('instagram_config')
      .select('id, instagram_business_id, page_id, status, connected_at')
      .eq('account_id', accountId)
      .maybeSingle()

    if (error) {
      console.error('[instagram/config GET]', error)
      return NextResponse.json(
        { connected: false, reason: 'db_error' },
        { status: 200 },
      )
    }

    return NextResponse.json({
      connected: data?.status === 'connected',
      instagram_business_id: data?.instagram_business_id ?? null,
      page_id: data?.page_id ?? null,
      connected_at: data?.connected_at ?? null,
    })
  } catch (err) {
    console.error('[instagram/config GET]', err)
    return NextResponse.json(
      { connected: false, reason: 'unknown' },
      { status: 500 },
    )
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const { error } = await supabase
      .from('instagram_config')
      .delete()
      .eq('account_id', accountId)

    if (error) {
      console.error('[instagram/config DELETE]', error)
      return NextResponse.json(
        { error: 'Failed to delete configuration' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[instagram/config DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
