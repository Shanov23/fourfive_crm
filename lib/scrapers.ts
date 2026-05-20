import { Lead, generateId } from './store'

const SUBREDDITS = ['startups', 'entrepreneur', 'SaaS', 'smallbusiness', 'indiehackers']

const PAIN_KEYWORDS: Record<string, string[]> = {
  website: ['website', 'landing page', 'web presence', 'online presence', 'site looks', 'no website', 'need a site', 'build a site', 'web design', 'homepage', 'domain', 'portfolio', 'wix', 'squarespace', 'webflow', 'wordpress'],
  design: ['design', 'branding', 'logo', 'visual identity', 'looks bad', 'ugly', 'unprofessional', 'brand identity', 'pitch deck', 'ui', 'ux', 'figma', 'color', 'font', 'typography'],
  automation: ['automate', 'automation', 'manual', 'repetitive', 'save time', 'workflow', 'zapier', 'make.com', 'n8n', 'airtable', 'notion', 'spreadsheet', 'tedious', 'too much time', 'hours every'],
  'no-online-presence': ['no traffic', 'no visitors', 'google', 'seo', 'visibility', 'find us online', 'search', 'ranking'],
  branding: ['rebrand', 'brand', 'positioning', 'messaging', 'copy', 'tagline', 'identity', 'perception'],
}

const FOUNDER_KEYWORDS = [
  'founder', 'startup', 'bootstrapped', 'saas', 'launched', 'building', 'indie hacker',
  'side project', 'mvp', 'product', 'customers', 'revenue', 'mrr', 'arr', 'b2b', 'b2c',
  'entrepreneur', 'solopreneur', 'freelance', 'agency', 'client', 'project', 'app', 'tool',
  'software', 'service', 'business', 'feedback', 'help', 'advice', 'struggling', 'problem',
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
  const found: string[] = []
  for (const [pain, keywords] of Object.entries(PAIN_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) found.push(pain)
  }
  return found
}

function isFounderPost(text: string): boolean {
  const lower = text.toLowerCase()
  return FOUNDER_KEYWORDS.some(k => lower.includes(k))
}

function detectUrgency(text: string): Lead['urgency'] {
  const lower = text.toLowerCase()
  if (['urgent', 'asap', 'immediately', 'help!', 'desperate', 'launch tomorrow', 'need today', 'critical'].some(w => lower.includes(w))) return 'critical'
  if (['this week', 'soon', 'quickly', 'struggling', 'losing', 'stuck', 'frustrated'].some(w => lower.includes(w))) return 'high'
  if (['eventually', 'thinking about', 'considering', 'someday'].some(w => lower.includes(w))) return 'low'
  return 'medium'
}

function timeAgo(utcSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - utcSeconds
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export async function scrapeReddit(): Promise<Lead[]> {
  const leads: Lead[] = []

  for (const sub of SUBREDDITS) {
    try {
      console.log(`[reddit] scraping r/${sub}...`)
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/new.json?limit=50`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FourFiveCRM/1.0)',
            'Accept': 'application/json',
          },
          cache: 'no-store',
        }
      )
      console.log(`[reddit] r/${sub} status:`, res.status)
      if (!res.ok) {
        console.error(`[reddit] r/${sub} failed:`, res.status, res.statusText)
        continue
      }
      const data = await res.json()
      const posts = data?.data?.children || []
      console.log(`[reddit] r/${sub} posts:`, posts.length)

      for (const { data: post } of posts) {
        if (post.is_self === false && !post.selftext) continue // skip link-only posts with no text
        const text = `${post.title} ${post.selftext || ''}`
        if (text.length < 20) continue

        // Accept if it's a founder post OR mentions pain keywords
        const pains = detectPains(text)
        const isFounder = isFounderPost(text)
        if (!isFounder && pains.length === 0) continue

        const pain = pains[0] || 'website'
        leads.push({
          id: generateId(`reddit-${post.id}`),
          name: `u/${post.author}`,
          role: `Reddit · r/${sub}`,
          source: 'reddit',
          handle: `u/${post.author}`,
          twitter: '',
          linkedin: '',
          painRaw: post.title + (post.selftext ? ': ' + post.selftext.slice(0, 200) : ''),
          pains: pains.length ? pains : ['website'],
          offer: OFFERS[pain] || OFFERS.website,
          status: 'new',
          urgency: detectUrgency(text),
          time: timeAgo(post.created_utc),
          scrapedAt: new Date().toISOString(),
          url: `https://reddit.com${post.permalink}`,
        })
      }
      console.log(`[reddit] r/${sub} leads added:`, leads.length)
    } catch (e: any) {
      console.error(`[reddit] r/${sub} error:`, e.message)
    }
  }

  return leads
}

export async function scrapeProductHunt(): Promise<Lead[]> {
  try {
    console.log('[ph] scraping ProductHunt feed...')
    const res = await fetch('https://www.producthunt.com/feed', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FourFiveCRM/1.0)' },
      cache: 'no-store',
    })
    console.log('[ph] status:', res.status)
    if (!res.ok) return []
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    console.log('[ph] items found:', items.length)
    const leads: Lead[] = []

    for (const item of items.slice(0, 15)) {
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
                    item.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
                    item.match(/<description>(.*?)<\/description>/)?.[1] || '')
                    .replace(/<[^>]+>/g, '')
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || ''
      if (!title || title.length < 5) continue

      const text = `${title} ${desc}`
      const pains = detectPains(text)
      const pain = pains[0] || 'website'

      leads.push({
        id: generateId(`ph-${title}-${link}`),
        name: title.slice(0, 40),
        role: 'ProductHunt launch · founder',
        source: 'ph',
        handle: 'producthunt.com',
        twitter: '',
        linkedin: '',
        painRaw: desc.slice(0, 280) || title,
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

export async function scrapeIndieHackers(): Promise<Lead[]> {
  try {
    console.log('[ih] scraping IndieHackers...')
    const res = await fetch('https://www.indiehackers.com/feed.rss', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FourFiveCRM/1.0)' },
      cache: 'no-store',
    })
    console.log('[ih] status:', res.status)
    if (!res.ok) return []
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    console.log('[ih] items found:', items.length)
    const leads: Lead[] = []

    for (const item of items.slice(0, 20)) {
      const title = (item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '')
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
      const desc = (item.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '')
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim()
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || ''

      if (!title || title.length < 10) continue

      const text = `${title} ${desc}`
      const pains = detectPains(text)
      const pain = pains[0] || 'website'

      leads.push({
        id: generateId(`ih-${title}-${link}`),
        name: title.slice(0, 40),
        role: 'IndieHacker · bootstrapped founder',
        source: 'ih',
        handle: 'indiehackers.com',
        twitter: '',
        linkedin: '',
        painRaw: (desc || title).slice(0, 280),
        pains: pains.length ? pains : ['website'],
        offer: OFFERS[pain] || OFFERS.website,
        status: 'new',
        urgency: detectUrgency(text),
        time: 'today',
        scrapedAt: new Date().toISOString(),
        url: link,
      })
    }
    console.log('[ih] leads:', leads.length)
    return leads
  } catch (e: any) {
    console.error('[ih] error:', e.message)
    return []
  }
}

export async function enrichWithClaude(leads: Lead[], apiKey: string): Promise<Lead[]> {
  if (!apiKey || leads.length === 0) return leads
  const sample = leads.slice(0, 8)
  const prompt = `You are a business analyst for FourFive Studio, a design & dev studio in Pune. They build: websites, landing pages, brand identity, workflow automation, pitch decks. Pricing: ₹15k–40k. Delivery: 15 days.

Given these founder posts, for each one:
1. Identify the real pain point (website/design/automation/branding/no-online-presence)
2. Assess urgency (low/medium/high/critical) based on language signals
3. Write a specific FourFive offer (1 sentence, concrete, with price range)

Posts:
${sample.map((l, i) => `${i + 1}. [${l.source}] "${l.painRaw.slice(0, 150)}"`).join('\n')}

Respond ONLY with a JSON array of ${sample.length} objects: [{"pain":"string","urgency":"string","offer":"string"}]`

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
