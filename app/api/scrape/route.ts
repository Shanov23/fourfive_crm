import { NextRequest, NextResponse } from 'next/server'
import { scrapeReddit, scrapeProductHunt, scrapeIndieHackers, enrichWithClaude } from '@/lib/scrapers'
import { upsertLeads } from '@/lib/store'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY || ''
  const results: Record<string, any> = {}

  try {
    console.log('[scrape] starting...')

    const [reddit, ph, ih] = await Promise.allSettled([
      scrapeReddit(),
      scrapeProductHunt(),
      scrapeIndieHackers(),
    ])

    const redditLeads = reddit.status === 'fulfilled' ? reddit.value : []
    const phLeads = ph.status === 'fulfilled' ? ph.value : []
    const ihLeads = ih.status === 'fulfilled' ? ih.value : []

    results.reddit = { count: redditLeads.length, error: reddit.status === 'rejected' ? reddit.reason?.message : null }
    results.producthunt = { count: phLeads.length, error: ph.status === 'rejected' ? ph.reason?.message : null }
    results.indiehackers = { count: ihLeads.length, error: ih.status === 'rejected' ? ih.reason?.message : null }

    console.log('[scrape] reddit:', redditLeads.length, 'ph:', phLeads.length, 'ih:', ihLeads.length)

    let raw = [...redditLeads, ...phLeads, ...ihLeads]
    console.log('[scrape] total raw:', raw.length)

    if (apiKey && raw.length > 0) {
      raw = await enrichWithClaude(raw, apiKey)
      console.log('[scrape] after enrich:', raw.length)
    }

    const all = await upsertLeads(raw)
    return NextResponse.json({ success: true, scraped: raw.length, total: all.length, sources: results })
  } catch (e: any) {
    console.error('[scrape] fatal error:', e)
    return NextResponse.json({ success: false, error: e.message, sources: results }, { status: 500 })
  }
}
