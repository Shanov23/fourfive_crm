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
const LEADS_KEY = 'fourfive:leads'

// Uses Upstash REST API correctly:
// GET: /get/{key}
// SET: POST to /set/{key}/{value} with value URL-encoded in path
// For large values: POST to /set/{key} with body as the value

async function redisGet(key: string): Promise<string | null> {
  if (!REDIS_URL || !REDIS_TOKEN) {
    console.error('Redis env vars missing')
    return null
  }
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    })
    const json = await res.json()
    console.log('[redis get] status:', res.status, 'result type:', typeof json.result)
    if (!res.ok) {
      console.error('[redis get] error:', JSON.stringify(json))
      return null
    }
    return json.result ?? null
  } catch (e) {
    console.error('[redis get] fetch error:', e)
    return null
  }
}

async function redisSet(key: string, value: string): Promise<boolean> {
  if (!REDIS_URL || !REDIS_TOKEN) {
    console.error('Redis env vars missing')
    return false
  }
  try {
    // POST the value as the request body — Upstash appends it as last param
    const res = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
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
    console.error('[redis set] fetch error:', e)
    return false
  }
}

export async function readLeads(): Promise<Lead[]> {
  try {
    const raw = await redisGet(LEADS_KEY)
    if (!raw) {
      console.log('[readLeads] no data in redis')
      return []
    }
    const parsed = JSON.parse(raw)
    console.log('[readLeads] parsed leads count:', Array.isArray(parsed) ? parsed.length : 'not array')
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('[readLeads] parse error:', e)
    return []
  }
}

export async function writeLeads(leads: Lead[]): Promise<void> {
  const serialized = JSON.stringify(leads)
  console.log('[writeLeads] writing', leads.length, 'leads, size:', serialized.length, 'chars')
  const ok = await redisSet(LEADS_KEY, serialized)
  if (!ok) console.error('[writeLeads] redis set failed')
}

export async function upsertLeads(newLeads: Lead[]): Promise<Lead[]> {
  const existing = await readLeads()
  const existingIds = new Set(existing.map(l => l.id))
  const merged = [...existing]
  let added = 0
  for (const l of newLeads) {
    if (!existingIds.has(l.id)) {
      merged.push(l)
      existingIds.add(l.id)
      added++
    }
  }
  console.log(`[upsertLeads] added ${added} new, total ${merged.length}`)
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
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}
