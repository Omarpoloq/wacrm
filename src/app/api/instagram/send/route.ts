// src/app/api/instagram/send/route.ts
//
// Send a message via the Instagram Platform API (graph.instagram.com).
// Uses the Instagram Business Account ID and long-lived access token
// stored in instagram_config for the authenticated user's account.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const INSTAGRAM_GRAPH_BASE = 'https://graph.instagram.com/v20.0'

export async function POST(req: NextRequest) {
  try {
    const {
      conversation_id,
      content_text,
      message_type = 'text',
      media_url,
      reply_to_message_id,
    } = await req.json()

    if (!conversation_id) {
      return NextResponse.json(
        { error: 'conversation_id es requerido' },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Get the caller's account_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileError || !profile?.account_id) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }
    const accountId = profile.account_id

    // 1. Load conversation + contact's external_id (IGSID)
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select(
        `
        id,
        account_id,
        channel,
        contacts ( external_id )
      `,
      )
      .eq('id', conversation_id)
      .single()

    if (convError || !conv) {
      return NextResponse.json(
        { error: 'Conversación no encontrada' },
        { status: 404 },
      )
    }

    const contacts = conv.contacts as
      | { external_id: string }[]
      | { external_id: string }
      | null
    const recipientId = Array.isArray(contacts)
      ? contacts[0]?.external_id
      : contacts?.external_id

    if (!recipientId) {
      return NextResponse.json(
        { error: 'El contacto no tiene external_id (IGSID)' },
        { status: 400 },
      )
    }

    // 2. Load the Instagram config for this account
    const { data: config, error: configError } = await supabase
      .from('instagram_config')
      .select('access_token, instagram_business_id, page_id, status')
      .eq('account_id', accountId)
      .maybeSingle()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'Instagram no está conectado para esta cuenta' },
        { status: 400 },
      )
    }

    if (config.status !== 'connected') {
      return NextResponse.json(
        { error: 'La conexión de Instagram no está activa' },
        { status: 400 },
      )
    }

    const accessToken = config.access_token
    const igBusinessId = config.instagram_business_id

    if (!accessToken || !igBusinessId) {
      return NextResponse.json(
        { error: 'Configuración de Instagram incompleta' },
        { status: 500 },
      )
    }

    // 3. Build the request body for graph.instagram.com
    const isMedia = !!media_url

    if (isMedia && message_type === 'audio') {
      return NextResponse.json(
        { error: 'Instagram no soporta envío de audio' },
        { status: 400 },
      )
    }

    const igBody: Record<string, unknown> = {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
    }

    if (isMedia) {
      const mediaType =
        message_type === 'image'
          ? 'image'
          : message_type === 'video'
          ? 'video'
          : message_type === 'document'
          ? 'file'
          : 'image'

      igBody.message = {
        attachment: {
          type: mediaType,
          payload: { url: media_url, is_reusable: true },
        },
      }
    } else {
      igBody.message = { text: content_text }
    }

    // 4. POST to Instagram Platform API
    const endpoint = `${INSTAGRAM_GRAPH_BASE}/${igBusinessId}/messages`
    const igRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(igBody),
    })

    const igData = await igRes.json()

    if (!igRes.ok) {
      console.error('[Instagram send] API error:', igData)
      return NextResponse.json(
        { error: igData.error?.message || 'Error al enviar' },
        { status: igRes.status },
      )
    }

    // 5. Persist in DB
    const { error: insertError } = await supabase.from('messages').insert({
      conversation_id,
      sender_type: 'agent',
      content_type: isMedia ? message_type : 'text',
      content_text: content_text ?? null,
      media_url: media_url ?? null,
      status: 'sent',
      channel: 'instagram',
      message_id: igData.message_id ?? null,
      reply_to_message_id: reply_to_message_id ?? null,
      ai_generated: false,
      created_at: new Date().toISOString(),
    })

    if (insertError) {
      console.error('[Instagram send] Error guardando mensaje en BD:', insertError)
    }

    await supabase
      .from('conversations')
      .update({
        last_message_text: content_text,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversation_id)

    return NextResponse.json({ success: true, messageId: igData.message_id })
  } catch (err) {
    console.error('Error en /api/instagram/send:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}