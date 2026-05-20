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

async function redisGet(key: string): Promise<any> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  const res = await fetch(`${REDIS_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    cache: 'no-store',
  })
  const data = await res.json()
  return data.result
}

async function redisSet(key: string, value: any): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return
  await fetch(`${REDIS_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: JSON.stringify(value) }),
    cache: 'no-store',
  })
}

export async function readLeads(): Promise<Lead[]> {
  try {
    const raw = await redisGet(LEADS_KEY)
    if (!raw) return []
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('readLeads error', e)
    return []
  }
}

export async function writeLeads(leads: Lead[]): Promise<void> {
  await redisSet(LEADS_KEY, leads)
}

export async function upsertLeads(newLeads: Lead[]): Promise<Lead[]> {
  const existing = await readLeads()
  const existingIds = new Set(existing.map(l => l.id))
  const merged = [...existing]
  for (const l of newLeads) {
    if (!existingIds.has(l.id)) {
      merged.push(l)
      existingIds.add(l.id)
    }
  }
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
