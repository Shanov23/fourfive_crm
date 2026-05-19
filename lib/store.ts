import fs from 'fs'
import path from 'path'

const DATA_FILE = path.join('/tmp', 'fourfive_leads.json')

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

export function readLeads(): Lead[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    }
  } catch {}
  return []
}

export function writeLeads(leads: Lead[]) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(leads, null, 2))
  } catch (e) {
    console.error('write leads error', e)
  }
}

export function upsertLeads(newLeads: Lead[]) {
  const existing = readLeads()
  const existingIds = new Set(existing.map(l => l.id))
  const merged = [...existing]
  for (const l of newLeads) {
    if (!existingIds.has(l.id)) {
      merged.push(l)
      existingIds.add(l.id)
    }
  }
  writeLeads(merged)
  return merged
}

export function updateLeadStatus(id: string, status: Lead['status']): Lead[] {
  const leads = readLeads()
  const updated = leads.map(l => l.id === id ? { ...l, status } : l)
  writeLeads(updated)
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
