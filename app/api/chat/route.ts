import { NextRequest, NextResponse } from 'next/server'
import { readLeads } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { message, history } = await req.json()
  const apiKey = process.env.ANTHROPIC_API_KEY || ''

  if (!apiKey) {
    return NextResponse.json({ reply: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to your environment variables.' })
  }

  const leads = readLeads()
  const leadsContext = leads.length
    ? leads.slice(0, 20).map(l =>
        `• ${l.name} | ${l.role} | pains: ${l.pains.join('/')} | status: ${l.status} | urgency: ${l.urgency} | "${l.painRaw.slice(0, 100)}"`
      ).join('\n')
    : 'No leads loaded yet.'

  const systemPrompt = `You are a sharp business analyst for FourFive Studio — a design & development studio in Pune run by Shon. They build: websites, landing pages, brand identity, workflow automation, pitch decks. Pricing: ₹15k–40k. Delivery: 15 days.

Today's leads:
${leadsContext}

Be direct, specific, actionable. Max 120 words. Use bullet points when listing. When asked to draft DMs, write ready-to-send messages — no filler, lead with their pain, one clear CTA.`

  const messages = [
    ...(history || []),
    { role: 'user', content: message }
  ]

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      })
    })
    const data = await res.json()
    const reply = data.content?.[0]?.text || 'No response generated.'
    return NextResponse.json({ reply })
  } catch (e: any) {
    return NextResponse.json({ reply: `Error: ${e.message}` }, { status: 500 })
  }
}
