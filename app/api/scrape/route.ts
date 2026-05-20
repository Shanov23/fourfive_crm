import { NextRequest, NextResponse } from 'next/server'
import { scrapeHackerNews, scrapeRSSFeeds, scrapeProductHunt, enrichWithClaude } from '@/lib/scrapers'
import { upsertLeads } from '@/lib/store'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY || ''
  const results: Record<string, any> = {}

  try {
    console.log('[scrape] starting...')

    const [hn, rss, ph] = await Promise.allSettled([
      scrapeHackerNews(),
      scrapeRSSFeeds(),
      scrapeProductHunt(),
    ])

    const hnLeads = hn.status === 'fulfilled' ? hn.value : []
    const rssLeads = rss.status === 'fulfilled' ? rss.value : []
    const phLeads = ph.status === 'fulfilled' ? ph.value : []

    results.hackernews = { count: hnLeads.length, error: hn.status === 'rejected' ? (hn as any).reason?.message : null }
    results.rss = { count: rssLeads.length, error: rss.status === 'rejected' ? (rss as any).reason?.message : null }
    results.producthunt = { count: phLeads.length, error: ph.status === 'rejected' ? (ph as any).reason?.message : null }

    console.log('[scrape] hn:', hnLeads.length, 'rss:', rssLeads.length, 'ph:', phLeads.length)

    let raw = [...hnLeads, ...rssLeads, ...phLeads]
    console.log('[scrape] total raw:', raw.length)

    if (apiKey && raw.length > 0) {
      raw = await enrichWithClaude(raw, apiKey)
    }

    const all = await upsertLeads(raw)
    return NextResponse.json({ success: true, scraped: raw.length, total: all.length, sources: results })
  } catch (e: any) {
    console.error('[scrape] fatal:', e)
    return NextResponse.json({ success: false, error: e.message, sources: results }, { status: 500 })
  }
}
