import { Lead, generateId } from './store'

const PAIN_KEYWORDS: Record<string, string[]> = {
  website: ['website', 'landing page', 'web presence', 'no website', 'need a site', 'build a site', 'web design', 'homepage', 'portfolio', 'wix', 'squarespace', 'webflow', 'wordpress'],
  design: ['design', 'branding', 'logo', 'visual identity', 'looks bad', 'unprofessional', 'brand identity', 'pitch deck', 'ui', 'ux', 'redesign'],
  automation: ['automate', 'automation', 'manual process', 'save time', 'workflow', 'zapier', 'make.com', 'n8n', 'repetitive', 'manually', 'hours every'],
  'no-online-presence': ['no traffic', 'seo', 'visibility', 'search ranking', 'google ranking', 'organic traffic'],
  branding: ['rebrand', 'brand identity', 'positioning', 'messaging', 'tagline', 'brand strategy'],
}

const OFFERS: Record<string, string> = {
  website: 'Landing page or full site — live in 15 days. ₹15–30k.',
  design: 'Brand identity + design system. ₹20–40k.',
  automation: 'Workflow automation setup — save 10+ hrs/week. ₹15–35k.',
  'no-online-presence': 'SEO-ready site + Google presence. ₹20–30k.',
  branding: 'Brand identity, messaging + visual system. ₹25–40k.',
}

// High-signal Twitter search queries targeting founders with real pain/intent
const TWITTER_QUERIES = [
  // Direct pain signals
  'need a website designer india -is:retweet lang:en',
  'looking for web designer india -is:retweet lang:en',
  'need landing page designer -is:retweet lang:en',
  'website looks terrible -is:retweet lang:en',
  'our website is bad -is:retweet lang:en',
  'need to redesign website -is:retweet lang:en',
  'need a logo designer india -is:retweet lang:en',
  'looking for branding designer -is:retweet lang:en',
  // Build in public — founders sharing progress
  'just launched my startup -is:retweet lang:en',
  'building in public saas -is:retweet lang:en',
  'launched my product -is:retweet lang:en',
  // India specific founder signals
  'startup india design -is:retweet lang:en',
  'indie hacker india -is:retweet lang:en',
  'bootstrapped india -is:retweet lang:en',
]

function detectPains(text: string): string[] {
  const lower = text.toLowerCase()
  return Object.entries(PAIN_KEYWORDS)
    .filter(([, kws]) => kws.some(k => lower.includes(k)))
    .map(([pain]) => pain)
}

function detectUrgency(text: string): Lead['urgency'] {
  const lower = text.toLowerCase()
  if (['urgent', 'asap', 'immediately', 'desperately', 'help!', 'need now', 'today'].some(w => lower.includes(w))) return 'critical'
  if (['this week', 'soon', 'quickly', 'struggling', 'stuck', 'frustrated', 'badly need'].some(w => lower.includes(w))) return 'high'
  if (['eventually', 'thinking about', 'considering', 'someday'].some(w => lower.includes(w))) return 'low'
  return 'medium'
}

function timeAgo(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export async function scrapeTwitter(): Promise<Lead[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN || ''
  if (!bearerToken) {
    console.log('[twitter] no bearer token configured')
    return []
  }

  const leads: Lead[] = []
  const seenIds = new Set<string>()

  // Run a subset of queries to stay within rate limits
  const queriesToRun = TWITTER_QUERIES.slice(0, 8)

  for (const query of queriesToRun) {
    try {
      console.log(`[twitter] searching: ${query.slice(0, 50)}...`)

      const params = new URLSearchParams({
        query,
        max_results: '20',
        'tweet.fields': 'created_at,author_id,public_metrics,entities',
        'user.fields': 'name,username,description,public_metrics,url,entities',
        expansions: 'author_id',
      })

      const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
        cache: 'no-store',
      })

      console.log(`[twitter] status: ${res.status}`)
      if (!res.ok) {
        const err = await res.text()
        console.error(`[twitter] error:`, err.slice(0, 200))
        continue
      }

      const data = await res.json()
      const tweets = data.data || []
      const users: Record<string, any> = {}

      // Map users by ID
      for (const user of (data.includes?.users || [])) {
        users[user.id] = user
      }

      console.log(`[twitter] got ${tweets.length} tweets`)

      for (const tweet of tweets) {
        if (seenIds.has(tweet.id)) continue
        seenIds.add(tweet.id)

        const user = users[tweet.author_id] || {}
        const text = tweet.text
        const pains = detectPains(text)
        const pain = pains[0] || 'website'

        // Build all contact links
        const twitterProfileUrl = `https://twitter.com/${user.username}`
        const tweetUrl = `https://twitter.com/${user.username}/status/${tweet.id}`
        const dmUrl = `https://twitter.com/messages/compose?recipient_id=${tweet.author_id}`

        leads.push({
          id: generateId(`tw-${tweet.id}`),
          name: user.name || `@${user.username}`,
          role: `Twitter · ${user.description ? user.description.slice(0, 60) : 'founder'}`,
          source: 'twitter',
          handle: `@${user.username}`,
          twitter: twitterProfileUrl,
          linkedin: '',
          hnProfile: '',
          replyUrl: tweetUrl,
          dmUrl: dmUrl,
          twitterHandle: user.username,
          twitterFollowers: user.public_metrics?.followers_count || 0,
          reachOut: `Reply to their tweet or DM @${user.username} on Twitter`,
          painRaw: text,
          pains: pains.length ? pains : ['website'],
          offer: OFFERS[pain] || OFFERS.website,
          status: 'new',
          urgency: detectUrgency(text),
          time: timeAgo(tweet.created_at || new Date().toISOString()),
          scrapedAt: new Date().toISOString(),
          url: tweetUrl,
          score: tweet.public_metrics?.like_count || 0,
          comments: tweet.public_metrics?.reply_count || 0,
        })
      }

      // Small delay between queries to respect rate limits
      await new Promise(r => setTimeout(r, 500))
    } catch (e: any) {
      console.error(`[twitter] query error:`, e.message)
    }
  }

  console.log('[twitter] total leads:', leads.length)
  return leads
}

export async function scrapeHackerNews(): Promise<Lead[]> {
  const leads: Lead[] = []
  try {
    console.log('[hn] fetching Ask/Show HN...')
    const [askRes, showRes] = await Promise.allSettled([
      fetch('https://hacker-news.firebaseio.com/v0/askstories.json', { cache: 'no-store' }),
      fetch('https://hacker-news.firebaseio.com/v0/showstories.json', { cache: 'no-store' }),
    ])

    const allIds: number[] = []
    for (const result of [askRes, showRes]) {
      if (result.status === 'fulfilled' && result.value.ok) {
        const ids: number[] = await result.value.json()
        allIds.push(...ids.slice(0, 20))
      }
    }

    const uniqueIds = Array.from(new Set(allIds)).slice(0, 30)

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
        if (pains.length === 0) continue // HN: only take posts with clear pain signals

        const pain = pains[0]
        const hnPostUrl = `https://news.ycombinator.com/item?id=${story.id}`
        const diff = Math.floor(Date.now() / 1000) - (story.time || 0)
        const timeStr = diff < 3600 ? `${Math.floor(diff/60)}m ago` : diff < 86400 ? `${Math.floor(diff/3600)}h ago` : `${Math.floor(diff/86400)}d ago`

        leads.push({
          id: generateId(`hn-${story.id}`),
          name: story.by || 'anonymous',
          role: `HackerNews · ${story.title?.toLowerCase().startsWith('ask') ? 'Ask HN' : 'Show HN'}`,
          source: 'hn',
          handle: story.by || 'anonymous',
          twitter: '', linkedin: '',
          hnProfile: `https://news.ycombinator.com/user?id=${story.by}`,
          replyUrl: hnPostUrl,
          reachOut: `Reply to their HN post directly — they're actively looking for help`,
          painRaw: story.title + (story.text ? ': ' + story.text.replace(/<[^>]+>/g, '').slice(0, 200) : ''),
          pains,
          offer: OFFERS[pain] || OFFERS.website,
          status: 'new',
          urgency: detectUrgency(text),
          time: timeStr,
          scrapedAt: new Date().toISOString(),
          url: hnPostUrl,
          score: story.score || 0,
          comments: story.descendants || 0,
        })
      }
    }
    console.log('[hn] leads (pain-matched only):', leads.length)
  } catch (e: any) {
    console.error('[hn] error:', e.message)
  }
  return leads
}

export async function scrapeProductHunt(): Promise<Lead[]> {
  try {
    console.log('[ph] fetching RSS...')
    const res = await fetch('https://www.producthunt.com/feed', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    const leads: Lead[] = []

    for (const item of items.slice(0, 15)) {
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] || '').replace(/<[^>]+>/g, '').trim()
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || ''
      if (!title) continue
      const pains = detectPains(`${title} ${desc}`)
      const pain = pains[0] || 'website'
      leads.push({
        id: generateId(`ph-${title}`),
        name: title.slice(0, 40),
        role: 'ProductHunt launch · founder',
        source: 'ph',
        handle: 'producthunt.com',
        twitter: '', linkedin: '', hnProfile: '',
        replyUrl: `${link}#comment`,
        reachOut: 'Comment on their ProductHunt launch — they are actively seeking feedback and visibility',
        painRaw: (desc || title).slice(0, 280),
        pains: pains.length ? pains : ['website', 'no-online-presence'],
        offer: `Just launched on PH — ${OFFERS[pain]}`,
        status: 'new', urgency: 'high', time: 'today',
        scrapedAt: new Date().toISOString(),
        url: link, score: 0, comments: 0,
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
  const sample = leads.slice(0, 10)
  const prompt = `You are a business analyst for FourFive Studio, a design & dev studio in Pune. They build: websites, landing pages, brand identity, workflow automation, pitch decks. Pricing: ₹15k–40k. Delivery: 15 days.

For each founder post:
1. pain: website/design/automation/branding/no-online-presence
2. urgency: low/medium/high/critical  
3. offer: specific 1-sentence FourFive offer with price range
4. reachOut: exactly HOW to reach this person — reply to tweet, DM on Twitter, comment on PH, reply on HN etc. Be specific and actionable.
5. qualified: true/false — is this a real potential buyer (founder/business owner who might pay for design/web/automation work)?

Posts:
${sample.map((l, i) => `${i + 1}. [${l.source}] ${l.name}: "${l.painRaw.slice(0, 120)}"`).join('\n')}

Respond ONLY with JSON array: [{"pain":"string","urgency":"string","offer":"string","reachOut":"string","qualified":true}]`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
    })
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return leads
    const enriched = JSON.parse(jsonMatch[0])
    // Filter out unqualified leads
    return leads
      .map((l, i) => {
        const e = enriched[i]
        if (!e) return l
        return { ...l, pains: [e.pain, ...l.pains.filter((p: string) => p !== e.pain)].slice(0, 3), urgency: e.urgency || l.urgency, offer: e.offer || l.offer, reachOut: e.reachOut || l.reachOut, qualified: e.qualified }
      })
      .filter((l: any) => l.qualified !== false)
  } catch (e) {
    console.error('[claude enrich] error:', e)
    return leads
  }
}

export const scrapeReddit = scrapeHackerNews
export const scrapeIndieHackers = async (): Promise<Lead[]> => []
