import { Lead, generateId } from './store'

const PAIN_KEYWORDS: Record<string, string[]> = {
  website: ['website', 'landing page', 'web presence', 'online presence', 'site looks', 'no website', 'need a site', 'build a site', 'web design', 'homepage', 'portfolio', 'wix', 'squarespace', 'webflow', 'wordpress', 'domain'],
  design: ['design', 'branding', 'logo', 'visual identity', 'looks bad', 'ugly', 'unprofessional', 'brand identity', 'pitch deck', 'ui', 'ux', 'figma', 'redesign'],
  automation: ['automate', 'automation', 'manual', 'repetitive', 'save time', 'workflow', 'zapier', 'make.com', 'n8n', 'airtable', 'notion', 'spreadsheet', 'tedious', 'too much time', 'hours every', 'manually'],
  'no-online-presence': ['no traffic', 'no visitors', 'google', 'seo', 'visibility', 'search', 'ranking', 'organic'],
  branding: ['rebrand', 'brand', 'positioning', 'messaging', 'copy', 'tagline', 'identity', 'perception'],
}

const FOUNDER_KEYWORDS = [
  'founder', 'startup', 'bootstrapped', 'saas', 'launched', 'building', 'indie hacker',
  'side project', 'mvp', 'product', 'customers', 'revenue', 'mrr', 'arr', 'b2b', 'b2c',
  'entrepreneur', 'solopreneur', 'freelance', 'agency', 'client', 'app', 'tool',
  'software', 'service', 'business', 'feedback', 'help', 'advice', 'struggling',
  'show hn', 'ask hn', 'tell hn', 'who is hiring', 'launched', 'just shipped',
]

const OFFERS: Record<string, string> = {
  website: 'Landing page or full site — live in 15 days. ₹15–30k.',
  design: 'Brand identity + design system. ₹20–40k.',
  automation: 'Workflow automation setup — save 10+ hrs/week. ₹15–35k.',
  'no-online-presence': 'SEO-ready site + Google presence. ₹20–30k.',
  branding: 'Brand identity, messaging + visual system. ₹25–40k.',
}

function detectPains(text: string): string[] {
  const lower = text.toLowerCase()
  return Object.entries(PAIN_KEYWORDS)
    .filter(([, kws]) => kws.some(k => lower.includes(k)))
    .map(([pain]) => pain)
}

function isFounderPost(text: string): boolean {
  const lower = text.toLowerCase()
  return FOUNDER_KEYWORDS.some(k => lower.includes(k))
}

function detectUrgency(text: string): Lead['urgency'] {
  const lower = text.toLowerCase()
  if (['urgent', 'asap', 'immediately', 'help!', 'desperate', 'critical', 'emergency'].some(w => lower.includes(w))) return 'critical'
  if (['this week', 'soon', 'quickly', 'struggling', 'losing', 'stuck', 'frustrated', 'failing'].some(w => lower.includes(w))) return 'high'
  if (['eventually', 'thinking about', 'considering', 'someday'].some(w => lower.includes(w))) return 'low'
  return 'medium'
}

// HackerNews API — completely open, no auth, no IP blocking
export async function scrapeHackerNews(): Promise<Lead[]> {
  const leads: Lead[] = []

  try {
    console.log('[hn] fetching Ask HN stories...')

    // Get top Ask HN stories
    const [askRes, newRes, showRes] = await Promise.allSettled([
      fetch('https://hacker-news.firebaseio.com/v0/askstories.json', { cache: 'no-store' }),
      fetch('https://hacker-news.firebaseio.com/v0/newstories.json', { cache: 'no-store' }),
      fetch('https://hacker-news.firebaseio.com/v0/showstories.json', { cache: 'no-store' }),
    ])

    const allIds: number[] = []

    for (const result of [askRes, newRes, showRes]) {
      if (result.status === 'fulfilled' && result.value.ok) {
        const ids: number[] = await result.value.json()
        allIds.push(...ids.slice(0, 30))
      }
    }

    const uniqueIds = [...new Set(allIds)].slice(0, 60)
    console.log('[hn] fetching', uniqueIds.length, 'stories...')

    // Fetch stories in parallel batches
    const batchSize = 10
    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      const batch = uniqueIds.slice(i, i + batchSize)
      const stories = await Promise.allSettled(
        batch.map(id =>
          fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { cache: 'no-store' })
            .then(r => r.json())
        )
      )

      for (const result of stories) {
        if (result.status !== 'fulfilled') continue
        const story = result.value
        if (!story || !story.title || story.deleted || story.dead) continue

        const text = `${story.title} ${story.text || ''}`
        const pains = detectPains(text)
        const isFounder = isFounderPost(text)

        if (!isFounder && pains.length === 0) continue

        const pain = pains[0] || 'website'
        const timeAgo = (() => {
          const diff = Math.floor(Date.now() / 1000) - (story.time || 0)
          if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
          if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
          return `${Math.floor(diff / 86400)}d ago`
        })()

        leads.push({
          id: generateId(`hn-${story.id}`),
          name: `HN: ${story.by || 'anonymous'}`,
          role: `Hacker News · ${story.type === 'story' ? (story.title?.toLowerCase().startsWith('ask') ? 'Ask HN' : story.title?.toLowerCase().startsWith('show') ? 'Show HN' : 'Post') : 'Post'}`,
          source: 'hn',
          handle: `news.ycombinator.com/user?id=${story.by}`,
          twitter: '',
          linkedin: '',
          painRaw: story.title + (story.text ? ': ' + story.text.replace(/<[^>]+>/g, '').slice(0, 200) : ''),
          pains: pains.length ? pains : ['website'],
          offer: OFFERS[pain] || OFFERS.website,
          status: 'new',
          urgency: detectUrgency(text),
          time: timeAgo,
          scrapedAt: new Date().toISOString(),
          url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        })
      }
    }

    console.log('[hn] leads found:', leads.length)
  } catch (e: any) {
    console.error('[hn] error:', e.message)
  }

  return leads
}

// RSS via rss2json proxy — works from serverless
export async function scrapeRSSFeeds(): Promise<Lead[]> {
  const feeds = [
    { url: 'https://www.indiehackers.com/feed.rss', source: 'ih', role: 'IndieHacker' },
    { url: 'https://feeds.feedburner.com/entrepreneur/latest', source: 'entrepreneur', role: 'Entrepreneur.com' },
  ]

  const leads: Lead[] = []

  for (const feed of feeds) {
    try {
      // Use rss2json which works from server environments
      const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}&count=20`
      console.log(`[rss] fetching ${feed.source}...`)
      const res = await fetch(apiUrl, { cache: 'no-store' })
      if (!res.ok) { console.log(`[rss] ${feed.source} status:`, res.status); continue }
      const data = await res.json()
      if (data.status !== 'ok') { console.log(`[rss] ${feed.source} api error:`, data.message); continue }

      const items = data.items || []
      console.log(`[rss] ${feed.source} items:`, items.length)

      for (const item of items) {
        const text = `${item.title || ''} ${item.description?.replace(/<[^>]+>/g, '') || ''}`
        const pains = detectPains(text)
        const isFounder = isFounderPost(text)
        if (!isFounder && pains.length === 0) continue

        const pain = pains[0] || 'website'
        leads.push({
          id: generateId(`${feed.source}-${item.guid || item.link}`),
          name: item.author || feed.role,
          role: `${feed.role} · founder`,
          source: feed.source,
          handle: feed.source,
          twitter: '',
          linkedin: '',
          painRaw: (item.title + ': ' + (item.description?.replace(/<[^>]+>/g, '') || '')).slice(0, 280),
          pains: pains.length ? pains : ['website'],
          offer: OFFERS[pain] || OFFERS.website,
          status: 'new',
          urgency: detectUrgency(text),
          time: 'today',
          scrapedAt: new Date().toISOString(),
          url: item.link || '',
        })
      }
    } catch (e: any) {
      console.error(`[rss] ${feed.source} error:`, e.message)
    }
  }

  console.log('[rss] total leads:', leads.length)
  return leads
}

// ProductHunt via their public GraphQL API (no auth needed for basic data)
export async function scrapeProductHunt(): Promise<Lead[]> {
  try {
    console.log('[ph] fetching ProductHunt...')
    const res = await fetch('https://www.producthunt.com/feed', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      cache: 'no-store',
    })
    console.log('[ph] status:', res.status)
    if (!res.ok) return []
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    const leads: Lead[] = []

    for (const item of items.slice(0, 15)) {
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
                    item.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] || '')
                    .replace(/<[^>]+>/g, '').trim()
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || ''
      if (!title || title.length < 5) continue

      const text = `${title} ${desc}`
      const pains = detectPains(text)
      const pain = pains[0] || 'website'

      leads.push({
        id: generateId(`ph-${title}`),
        name: title.slice(0, 40),
        role: 'ProductHunt launch · founder',
        source: 'ph',
        handle: 'producthunt.com',
        twitter: '',
        linkedin: '',
        painRaw: (desc || title).slice(0, 280),
        pains: pains.length ? pains : ['website', 'no-online-presence'],
        offer: `Just launched on PH — ${OFFERS[pain]}`,
        status: 'new',
        urgency: 'high',
        time: 'today',
        scrapedAt: new Date().toISOString(),
        url: link,
      })
    }
    console.log('[ph] leads:', leads.length)
    return leads
  } catch (e: any) {
    console.error('[ph] error:', e.message)
    return []
  }
}

export async function enrichWithClaude(leads: Lead[], apiKey: string): Promise<Lead[]> {
  if (!apiKey || leads.length === 0) return leads
  const sample = leads.slice(0, 8)
  const prompt = `You are a business analyst for FourFive Studio, a design & dev studio in Pune. They build: websites, landing pages, brand identity, workflow automation, pitch decks. Pricing: ₹15k–40k. Delivery: 15 days.

For each founder post below:
1. pain point: website/design/automation/branding/no-online-presence
2. urgency: low/medium/high/critical
3. offer: specific 1-sentence FourFive offer with price range

Posts:
${sample.map((l, i) => `${i + 1}. "${l.painRaw.slice(0, 150)}"`).join('\n')}

Respond ONLY with JSON array: [{"pain":"string","urgency":"string","offer":"string"}]`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
    })
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return leads
    const enriched = JSON.parse(jsonMatch[0])
    return leads.map((l, i) => {
      const e = enriched[i]
      if (!e) return l
      return { ...l, pains: [e.pain, ...l.pains.filter((p: string) => p !== e.pain)].slice(0, 3), urgency: e.urgency || l.urgency, offer: e.offer || l.offer }
    })
  } catch (e) {
    console.error('[claude enrich] error:', e)
    return leads
  }
}

// Keep these as aliases for backward compatibility
export const scrapeReddit = scrapeHackerNews
export const scrapeIndieHackers = scrapeRSSFeeds
