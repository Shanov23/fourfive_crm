import { NextRequest, NextResponse } from 'next/server'
import { readLeads } from '@/lib/store'
import { sendTelegram, buildDigestMessage } from '@/lib/telegram'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN || ''
  const chatId = process.env.TELEGRAM_CHAT_ID || ''
  const hour = new Date().getUTCHours()
  const slot = hour < 10 ? 'morning' : 'afternoon'
  const leads = await readLeads()
  const message = buildDigestMessage(leads, slot)
  if (token && chatId) {
    const sent = await sendTelegram(token, chatId, message)
    return NextResponse.json({ success: sent, message, leads: leads.length })
  }
  return NextResponse.json({ success: false, reason: 'No telegram config', message, leads: leads.length })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const token = body.token || process.env.TELEGRAM_BOT_TOKEN || ''
    const chatId = body.chatId || process.env.TELEGRAM_CHAT_ID || ''
    const leads = await readLeads()
    const message = body.message || buildDigestMessage(leads, 'morning')
    if (!token || !chatId) {
      return NextResponse.json({ success: false, reason: 'Missing token or chatId', message })
    }
    const sent = await sendTelegram(token, chatId, message)
    return NextResponse.json({ success: sent, message })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
