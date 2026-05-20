import { NextRequest, NextResponse } from 'next/server'
import { readLeads, updateLeadStatus, deleteLeadById } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const leads = await readLeads()
  return NextResponse.json(leads)
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json()
  const leads = await updateLeadStatus(id, status)
  return NextResponse.json(leads)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const leads = await deleteLeadById(id)
  return NextResponse.json(leads)
}
