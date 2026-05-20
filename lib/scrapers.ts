import { Lead, generateId } from './store'

const SUBREDDITS = ['startups', 'entrepreneur', 'indiehackers', 'SaaS', 'smallbusiness']

const PAIN_KEYWORDS = {
  website: ['website', 'landing page', 'web presence', 'online presence', 'site looks', 'no website', 'need a site', 'build a site', 'web design'],
  design: ['design', 'branding', 'logo', 'visual identity', 'looks bad', 'ugly', 'unprofessional', 'brand identity', 'pitch deck'],
  automation: ['automate', 'automation', 'manual', 'repetitive', 'save time', 'workflow', 'zapier', 'make.com', 'n8n', 'airtable'],
  'no-online-presence': ['no traffic', 'no visitors', 'can\'t find us', 'not on google', 'seo', 'visibility'],
  branding: ['rebrand', 'brand', 'positioning', 'messaging', 'copy', 'tagline'],
}

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
  return found.length ? found : ['website']
}

function detectUrgency(text: string): Lead['urgency'] {
  const lower = text.toLowerCase()
  if (['urgent', 'asap', 'immediately', 'launch tomorrow', 'need today', 'help!', 'desperate'].some(w => lower.includes(w))) return 'critical'
  if (['this week', 'soon', 'quickly', 'struggling', 'losing'].some(w => lower.includes(w))) return 'high'
  if (['eventually', 'thinking about', 'considering'].some(w => lower.includes(w))) return 'low'
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
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/new.json?limit=25&t=day`,
        { headers: { 'User-Agent': 'FourFiveCRM/1.0' }, next: { revalidate: 0 } }
      )
      if (!res.ok) continue
      const data = await res.json()
      const posts = data?.data?.children || []

      for (const { data: post } of posts) {
        const text = `${post.title} ${post.selftext || ''}`
        const pains = detectPains(text)
        if (!pains.length && !text.toLowerCase().includes('help')) continue

        const selftext = post.selftext || post.title
        if (selftext.length < 40) continue

        const pain = pains[0]
        leads.push({
          id: generateId(`reddit-${post.id}`),
          name: post.author,
          role: `Reddit u/${post.author} · r/${sub}`,
          source: 'reddit',
          handle: `u/${post.author}`,
          twitter: '',
          linkedin: '',
          painRaw: selftext.slice(0, 280),
          pains,
          offer: OFFERS[pain] || OFFERS.website,
          status: 'new',
          urgency: detectUrgency(text),
          time: timeAgo(post.created_utc),
          scrapedAt: new Date().toISOString(),
          url: `https://reddit.com${post.permalink}`,
        })
      }
    } catch (e) {
      console.error(`Reddit scrape error for r/${sub}:`, e)
    }
  }

  return leads
}

export async function scrapeProductHunt(): Promise<Lead[]> {
  try {
    const res = await fetch('https://www.producthunt.com/feed', {
      headers: { 'User-Agent': 'FourFiveCRM/1.0' }
    })
    if (!res.ok) return []
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    const leads: Lead[] = []

    for (const item of items.slice(0, 10)) {
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || ''
      const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]?.replace(/<[^>]+>/g, '') || ''
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const text = `${title} ${desc}`
      const pains = detectPains(text)
      const pain = pains[0] || 'website'

      if (!title) continue
      leads.push({
        id: generateId(`ph-${title}`),
        name: `PH Launch: ${title.slice(0, 30)}`,
        role: 'ProductHunt launch · founder',
        source: 'ph',
        handle: '@producthunt',
        twitter: '',
        linkedin: '',
        painRaw: desc.slice(0, 280) || title,
        pains: pains.length ? pains : ['website', 'no-online-presence'],
        offer: `Just launched on PH with no proper site? ${OFFERS[pain]}`,
        status: 'new',
        urgency: 'high',
        time: 'today',
        scrapedAt: new Date().toISOString(),
        url: link,
      })
    }
    return leads
  } catch (e) {
    console.error('ProductHunt scrape error:', e)
    return []
  }
}

export async function scrapeIndieHackers(): Promise<Lead[]> {
  try {
    const res = await fetch('https://www.indiehackers.com/feed.rss', {
      headers: { 'User-Agent': 'FourFiveCRM/1.0' }
    })
    if (!res.ok) return []
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    const leads: Lead[] = []

    for (const item of items.slice(0, 15)) {
      const title = item.match(/<title>(.*?)<\/title>/)?.[1]?.replace(/&amp;/g, '&').replace(/&lt;/g,'<').replace(/&gt;/g,'>') || ''
      const desc = item.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#\d+;/g, '') || ''
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const text = `${title} ${desc}`
      const pains = detectPains(text)
      const pain = pains[0] || 'website'

      if (!title || title.length < 10) continue
      leads.push({
        id: generateId(`ih-${title}`),
        name: `IH: ${title.slice(0, 25)}`,
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
    return leads
  } catch (e) {
    console.error('IndieHackers scrape error:', e)
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

Respond ONLY with a JSON array of ${sample.length} objects: [{pain: string, urgency: string, offer: string}]`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return leads
    const enriched: { pain: string; urgency: string; offer: string }[] = JSON.parse(jsonMatch[0])

    return leads.map((l, i) => {
      const e = enriched[i]
      if (!e) return l
      return {
        ...l,
        pains: [e.pain, ...l.pains.filter(p => p !== e.pain)].slice(0, 3),
        urgency: (e.urgency as Lead['urgency']) || l.urgency,
        offer: e.offer || l.offer,
      }
    })
  } catch (e) {
    console.error('Claude enrich error:', e)
    return leads
  }
}
