import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'Auto-renew has been removed. Lease renewals are handled explicitly through the renewal signing workflow.',
    },
    { status: 410 }
  )
}
