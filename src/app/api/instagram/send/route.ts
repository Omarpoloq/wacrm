import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const {
      conversation_id,
      content_text,
      message_type = 'text',
      reply_to_message_id,
    } = await req.json()

    if (!conversation_id || !content_text) {
      return NextResponse.json(
        { error: 'conversation_id y content_text son requeridos' },
        { status: 400 }
      )
    }

    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json(
        { error: 'INSTAGRAM_ACCESS_TOKEN no configurado' },
        { status: 500 }
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    // Obtener conversación + external_id del contacto
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select(`
        id,
        account_id,
        channel,
        contacts (
          external_id
        )
      `)
      .eq('id', conversation_id)
      .single()

    if (convError || !conv) {
      return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
    }

    const recipientId = conv.contacts?.external_id
    if (!recipientId) {
      return NextResponse.json(
        { error: 'El contacto no tiene external_id (IGSID)' },
        { status: 400 }
      )
    }

    const pageId = process.env.INSTAGRAM_PAGE_ID
    if (!pageId) {
      return NextResponse.json({ error: 'INSTAGRAM_PAGE_ID no configurado' }, { status: 500 })
    }
    const igRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: content_text },
        messaging_type: 'RESPONSE',
      }),
    })

    const igData = await igRes.json()

    if (!igRes.ok) {
      console.error('Instagram API error:', igData)
      return NextResponse.json(
        { error: igData.error?.message || 'Error al enviar' },
        { status: igRes.status }
      )
    }

    // Guardar en BD
    const { error: insertError } = await supabase.from('messages').insert({
    conversation_id,
    sender_type: 'agent',
    content_type: 'text',
    content_text: content_text,
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