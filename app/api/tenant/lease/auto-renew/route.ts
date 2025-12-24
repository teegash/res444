import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        'Auto-renew has been removed. Lease renewals are now handled via an explicit renewal workflow.',
    },
    { status: 410 }
  )
}
