import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || ''
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || ''

export async function GET() {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return NextResponse.json({ error: 'Redis env vars missing', REDIS_URL: !!REDIS_URL, REDIS_TOKEN: !!REDIS_TOKEN })
  }

  // Try every possible key variant
  const keysToTry = ['fourfive_leads', 'fourfive:leads', 'fourfive%3Aleads']
  const results: Record<string, any> = {}

  for (const key of keysToTry) {
    const res = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    })
    const json = await res.json()
    results[key] = {
      status: res.status,
      resultType: typeof json.result,
      resultLength: typeof json.result === 'string' ? json.result.length : null,
      resultNull: json.result === null,
    }
  }

  // Also scan all keys
  const scanRes = await fetch(`${REDIS_URL}/keys/*`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    cache: 'no-store',
  })
  const scanJson = await scanRes.json()

  return NextResponse.json({
    envVarsPresent: { url: !!REDIS_URL, token: !!REDIS_TOKEN },
    allKeys: scanJson.result,
    keyTests: results,
  })
}
