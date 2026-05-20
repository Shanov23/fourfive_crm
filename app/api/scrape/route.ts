import { NextRequest, NextResponse } from 'next/server'
import { scrapeTwitter, scrapeHackerNews, scrapeProductHunt, enrichWithClaude } from '@/lib/scrapers'
import { upsertLeads, clearAllLeads } from '@/lib/store'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY || ''
  const { searchParams } = new URL(req.url)
  const fresh = searchParams.get('fresh') === 'true'

  // Optional: clear old leads and start fresh
  if (fresh) await clearAllLeads()

  try {
    console.log('[scrape] starting...')
    const [tw, hn, ph] = await Promise.allSettled([
      scrapeTwitter(),
      scrapeHackerNews(),
      scrapeProductHunt(),
    ])

    const twLeads = tw.status === 'fulfilled' ? tw.value : []
    const hnLeads = hn.status === 'fulfilled' ? hn.value : []
    const phLeads = ph.status === 'fulfilled' ? ph.value : []

    console.log('[scrape] twitter:', twLeads.length, 'hn:', hnLeads.length, 'ph:', phLeads.length)

    let raw = [...twLeads, ...hnLeads, ...phLeads]

    // Enrich + quality filter with Claude
    if (apiKey && raw.length > 0) {
      raw = await enrichWithClaude(raw, apiKey)
    }

    const all = await upsertLeads(raw)
    return NextResponse.json({
      success: true,
      scraped: raw.length,
      total: all.length,
      sources: {
        twitter: twLeads.length,
        hackernews: hnLeads.length,
        producthunt: phLeads.length,
      }
    })
  } catch (e: any) {
    console.error('[scrape] fatal:', e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
