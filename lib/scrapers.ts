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
  'show hn', 'ask hn', 'tell hn', 'launched', 'just shipped',
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

function timeAgo(utcSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - utcSeconds
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export async function scrapeHackerNews(): Promise<Lead[]> {
  const leads: Lead[] = []
  try {
    console.log('[hn] fetching stories...')
    const [askRes, showRes, newRes] = await Promise.allSettled([
      fetch('https://hacker-news.firebaseio.com/v0/askstories.json', { cache: 'no-store' }),
      fetch('https://hacker-news.firebaseio.com/v0/showstories.json', { cache: 'no-store' }),
      fetch('https://hacker-news.firebaseio.com/v0/newstories.json', { cache: 'no-store' }),
    ])

    const allIds: number[] = []
    for (const result of [askRes, showRes, newRes]) {
      if (result.status === 'fulfilled' && result.value.ok) {
        const ids: number[] = await result.value.json()
        allIds.push(...ids.slice(0, 40))
      }
    }

    const uniqueIds = Array.from(new Set(allIds)).slice(0, 80)
    console.log('[hn] fetching', uniqueIds.length, 'stories...')

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
        const isAsk = story.title?.toLowerCase().startsWith('ask hn')
        const isShow = story.title?.toLowerCase().startsWith('show hn')

        // Build actionable contact info
        const hnProfileUrl = `https://news.ycombinator.com/user?id=${story.by}`
        const hnPostUrl = `https://news.ycombinator.com/item?id=${story.id}`
        const replyUrl = `https://news.ycombinator.com/reply?id=${story.id}&goto=item%3Fid%3D${story.id}`

        leads.push({
          id: generateId(`hn-${story.id}`),
          name: story.by || 'anonymous',
          role: `Hacker News · ${isAsk ? 'Ask HN' : isShow ? 'Show HN' : 'Post'}`,
          source: 'hn',
          handle: `@${story.by}`,
          twitter: '',
          linkedin: '',
          hnProfile: hnProfileUrl,
          replyUrl: replyUrl,
          painRaw: story.title + (story.text ? ': ' + story.text.replace(/<[^>]+>/g, '').slice(0, 200) : ''),
          pains: pains.length ? pains : ['website'],
          offer: OFFERS[pain] || OFFERS.website,
          status: 'new',
          urgency: detectUrgency(text),
          time: timeAgo(story.time || 0),
          scrapedAt: new Date().toISOString(),
          url: hnPostUrl,
          score: story.score || 0,
          comments: story.descendants || 0,
        })
      }
    }
    console.log('[hn] leads:', leads.length)
  } catch (e: any) {
    console.error('[hn] error:', e.message)
  }
  return leads
}

export async function scrapeProductHunt(): Promise<Lead[]> {
  try {
    console.log('[ph] fetching via GraphQL...')
    // ProductHunt public GraphQL API - no auth needed for basic queries
    const query = `{
      posts(first: 20, order: NEWEST) {
        edges {
          node {
            id
            name
            tagline
            description
            url
            votesCount
            commentsCount
            website
            makers {
              id
              name
              username
              twitterUsername
              websiteUrl
            }
            topics {
              edges { node { name } }
            }
          }
        }
      }
    }`

    const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Public client token - works without user auth for read operations
        'Authorization': 'Bearer iDB2V0aLuaGemsJMWFJzOJcAFOFHwSIR7JBIwGwE0nk',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    })

    console.log('[ph] status:', res.status)
    if (!res.ok) {
      // Fallback to RSS
      return scrapeProductHuntRSS()
    }

    const data = await res.json()
    if (data.errors) {
      console.log('[ph] graphql errors, falling back to RSS')
      return scrapeProductHuntRSS()
    }

    const posts = data?.data?.posts?.edges || []
    console.log('[ph] posts:', posts.length)
    const leads: Lead[] = []

    for (const { node: post } of posts) {
      const text = `${post.name} ${post.tagline} ${post.description || ''}`
      const pains = detectPains(text)
      const pain = pains[0] || 'website'

      const maker = post.makers?.[0]
      leads.push({
        id: generateId(`ph-${post.id}`),
        name: maker?.name || post.name,
        role: `ProductHunt maker · ${post.name}`,
        source: 'ph',
        handle: maker?.username ? `@${maker.username}` : post.name,
        twitter: maker?.twitterUsername ? `twitter.com/${maker.twitterUsername}` : '',
        linkedin: '',
        hnProfile: '',
        replyUrl: `${post.url}#comment`,
        painRaw: `${post.name}: ${post.tagline}${post.description ? '. ' + post.description.slice(0, 150) : ''}`,
        pains: pains.length ? pains : ['website', 'no-online-presence'],
        offer: `Just launched on PH — ${OFFERS[pain]}`,
        status: 'new',
        urgency: 'high',
        time: 'today',
        scrapedAt: new Date().toISOString(),
        url: post.url || '',
        score: post.votesCount || 0,
        comments: post.commentsCount || 0,
        website: post.website || '',
        twitterHandle: maker?.twitterUsername || '',
      })
    }

    console.log('[ph] leads:', leads.length)
    return leads
  } catch (e: any) {
    console.error('[ph] graphql error:', e.message)
    return scrapeProductHuntRSS()
  }
}

async function scrapeProductHuntRSS(): Promise<Lead[]> {
  try {
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
      const text = `${title} ${desc}`
      const pains = detectPains(text)
      const pain = pains[0] || 'website'
      leads.push({
        id: generateId(`ph-rss-${title}`),
        name: title.slice(0, 40),
        role: 'ProductHunt launch · founder',
        source: 'ph',
        handle: 'producthunt.com',
        twitter: '', linkedin: '', hnProfile: '',
        replyUrl: `${link}#comment`,
        painRaw: (desc || title).slice(0, 280),
        pains: pains.length ? pains : ['website', 'no-online-presence'],
        offer: `Just launched — ${OFFERS[pain]}`,
        status: 'new', urgency: 'high', time: 'today',
        scrapedAt: new Date().toISOString(),
        url: link, score: 0, comments: 0,
      })
    }
    return leads
  } catch (e: any) {
    console.error('[ph-rss] error:', e.message)
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
4. reachOut: exactly HOW to reach this person (reply to their HN post, DM on Twitter @handle, comment on PH, etc) — be specific

Posts:
${sample.map((l, i) => `${i + 1}. [${l.source}] ${l.name}: "${l.painRaw.slice(0, 120)}"`).join('\n')}

Respond ONLY with JSON array: [{"pain":"string","urgency":"string","offer":"string","reachOut":"string"}]`

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
    return leads.map((l, i) => {
      const e = enriched[i]
      if (!e) return l
      return {
        ...l,
        pains: [e.pain, ...l.pains.filter((p: string) => p !== e.pain)].slice(0, 3),
        urgency: e.urgency || l.urgency,
        offer: e.offer || l.offer,
        reachOut: e.reachOut || '',
      }
    })
  } catch (e) {
    console.error('[claude enrich] error:', e)
    return leads
  }
}

export const scrapeReddit = scrapeHackerNews
export const scrapeIndieHackers = async (): Promise<Lead[]> => []
