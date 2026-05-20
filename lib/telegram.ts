import { Lead } from './store'

const TG_API = 'https://api.telegram.org/bot'

export async function sendTelegram(token: string, chatId: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(`${TG_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      })
    })
    const data = await res.json()
    return data.ok === true
  } catch (e) {
    console.error('Telegram send error:', e)
    return false
  }
}

export function buildDigestMessage(leads: Lead[], slot: 'morning' | 'afternoon'): string {
  const newLeads = leads.filter(l => l.status === 'new')
  const critical = leads.filter(l => l.urgency === 'critical')
  const high = leads.filter(l => l.urgency === 'high')
  const contacted = leads.filter(l => l.status === 'contacted')
  const replied = leads.filter(l => l.status === 'replied')

  const painCounts: Record<string, number> = {}
  newLeads.forEach(l => l.pains.forEach(p => { painCounts[p] = (painCounts[p] || 0) + 1 }))
  const topPains = Object.entries(painCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)

  const topLeads = [...critical, ...high].slice(0, 3)
  const emoji = slot === 'morning' ? '🌅' : '☀️'
  const time = slot === 'morning' ? '08:00 AM' : '02:00 PM'

  let msg = `${emoji} *FourFive Intel — ${time}*\n\n`
  msg += `📊 *Overview*\n`
  msg += `• ${newLeads.length} new leads · ${critical.length} critical\n`
  msg += `• ${contacted.length} contacted · ${replied.length} replied\n`
  msg += `• Total pipeline: ${leads.length} founders\n\n`

  if (topPains.length) {
    msg += `🔥 *Top pain points today*\n`
    topPains.forEach(([pain, count]) => { msg += `• ${pain}: ${count} founders\n` })
    msg += '\n'
  }

  if (topLeads.length) {
    msg += `🎯 *Action these now*\n`
    topLeads.forEach((l, i) => {
      const urgencyEmoji = l.urgency === 'critical' ? '🚨' : '⚡'
      msg += `${i + 1}. ${urgencyEmoji} *${l.name}*\n`
      msg += `   _"${l.painRaw.slice(0, 80)}..."_\n`
      msg += `   → ${l.offer}\n`
      if (l.url) msg += `   [View post](${l.url})\n`
      msg += '\n'
    })
  }

  if (replied.length) {
    msg += `💬 *Follow up needed*\n`
    replied.slice(0, 2).forEach(l => { msg += `• ${l.name} — replied, waiting for you\n` })
    msg += '\n'
  }

  msg += `_Open your CRM to action leads →_`
  return msg
}

export async function getChatId(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${TG_API}${token}/getUpdates`)
    const data = await res.json()
    const update = data.result?.[0]
    return update?.message?.chat?.id?.toString() || null
  } catch {
    return null
  }
}
