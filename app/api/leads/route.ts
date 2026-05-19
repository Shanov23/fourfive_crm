import { NextRequest, NextResponse } from 'next/server'
import { readLeads, updateLeadStatus, writeLeads } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const leads = readLeads()
  return NextResponse.json(leads)
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json()
  const leads = updateLeadStatus(id, status)
  return NextResponse.json(leads)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const leads = readLeads().filter(l => l.id !== id)
  writeLeads(leads)
  return NextResponse.json(leads)
}
