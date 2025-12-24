import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  void request
  return NextResponse.json(
    {
      success: false,
      error:
        'Auto-renew has been removed. Lease renewals are now handled through an explicit renewal signing workflow.',
    },
    { status: 410 }
  )
}
