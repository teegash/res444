import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { success: true, message: 'M-Pesa callback base endpoint is alive' },
    { status: 200 }
  )
}

export async function POST() {
  return NextResponse.json({ success: true, message: 'Callback received' }, { status: 200 })
}
