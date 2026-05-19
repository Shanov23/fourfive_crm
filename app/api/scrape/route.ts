import { NextRequest, NextResponse } from 'next/server'
import { scrapeReddit, scrapeProductHunt, scrapeIndieHackers, enrichWithClaude } from '@/lib/scrapers'
import { upsertLeads } from '@/lib/store'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY || ''

  try {
    console.log('Starting scrape...')
    const [reddit, ph, ih] = await Promise.all([
      scrapeReddit(),
      scrapeProductHunt(),
      scrapeIndieHackers(),
    ])

    let raw = [...reddit, ...ph, ...ih]
    console.log(`Scraped ${raw.length} raw leads`)

    if (apiKey && raw.length > 0) {
      raw = await enrichWithClaude(raw, apiKey)
      console.log('Enriched with Claude')
    }

    const all = upsertLeads(raw)
    return NextResponse.json({ success: true, scraped: raw.length, total: all.length })
  } catch (e: any) {
    console.error('Scrape error:', e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
