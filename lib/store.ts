export interface Lead {
  id: string
  name: string
  role: string
  source: string
  handle: string
  twitter: string
  linkedin: string
  painRaw: string
  pains: string[]
  offer: string
  status: 'new' | 'contacted' | 'replied' | 'closed'
  urgency: 'low' | 'medium' | 'high' | 'critical'
  time: string
  scrapedAt: string
  url?: string
}

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || ''
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || ''
const LEADS_KEY = 'fourfive_leads' // no colon — avoids encoding issues

async function redisGet(key: string): Promise<string | null> {
  if (!REDIS_URL || !REDIS_TOKEN) { console.error('[redis] env vars missing'); return null }
  try {
    const res = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    })
    const json = await res.json()
    console.log('[redis get] status:', res.status, 'result type:', typeof json.result, 'length:', typeof json.result === 'string' ? json.result.length : json.result)
    return typeof json.result === 'string' ? json.result : null
  } catch (e) {
    console.error('[redis get] error:', e)
    return null
  }
}

async function redisSet(key: string, value: string): Promise<boolean> {
  if (!REDIS_URL || !REDIS_TOKEN) { console.error('[redis] env vars missing'); return false }
  try {
    const res = await fetch(`${REDIS_URL}/set/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: value,
      cache: 'no-store',
    })
    const json = await res.json()
    console.log('[redis set] status:', res.status, 'result:', JSON.stringify(json))
    return json.result === 'OK'
  } catch (e) {
    console.error('[redis set] error:', e)
    return false
  }
}

export async function readLeads(): Promise<Lead[]> {
  try {
    const raw = await redisGet(LEADS_KEY)
    if (!raw) { console.log('[readLeads] nothing in redis'); return [] }
    const parsed = JSON.parse(raw)
    console.log('[readLeads] count:', Array.isArray(parsed) ? parsed.length : 'not array')
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('[readLeads] parse error:', e)
    return []
  }
}

export async function writeLeads(leads: Lead[]): Promise<void> {
  const s = JSON.stringify(leads)
  console.log('[writeLeads]', leads.length, 'leads,', s.length, 'chars')
  const ok = await redisSet(LEADS_KEY, s)
  if (!ok) console.error('[writeLeads] failed!')
}

export async function upsertLeads(newLeads: Lead[]): Promise<Lead[]> {
  const existing = await readLeads()
  const existingIds = new Set(existing.map(l => l.id))
  const merged = [...existing]
  let added = 0
  for (const l of newLeads) {
    if (!existingIds.has(l.id)) { merged.push(l); existingIds.add(l.id); added++ }
  }
  console.log(`[upsertLeads] +${added} new, total ${merged.length}`)
  await writeLeads(merged)
  return merged
}

export async function updateLeadStatus(id: string, status: Lead['status']): Promise<Lead[]> {
  const leads = await readLeads()
  const updated = leads.map(l => l.id === id ? { ...l, status } : l)
  await writeLeads(updated)
  return updated
}

export async function deleteLeadById(id: string): Promise<Lead[]> {
  const leads = await readLeads()
  const updated = leads.filter(l => l.id !== id)
  await writeLeads(updated)
  return updated
}

export function generateId(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0 }
  return Math.abs(hash).toString(36)
}
