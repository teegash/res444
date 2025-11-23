import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type PaymentRow = {
  tenant_user_id: string
  payment_date: string | null
  created_at: string | null
  invoices: {
    due_date: string | null
  } | null
}

export async function GET() {
  const admin = createAdminClient()

  try {
    const { data: payments, error } = await admin
      .from('payments')
      .select(
        `
        tenant_user_id,
        payment_date,
        created_at,
        verified,
        invoices (
          due_date
        )
      `
      )
      .eq('verified', true)
      .not('tenant_user_id', 'is', null)

    if (error) {
      throw error
    }

    const stats = new Map<
      string,
      { total: number; onTime: number; sampleDate: string | null }
    >()

    ;(payments || []).forEach((row: any) => {
      const payment = row as PaymentRow
      const tenantId = payment.tenant_user_id
      if (!tenantId) return

      const dueDate = payment.invoices?.due_date ? new Date(payment.invoices.due_date) : null
      const paidDate = payment.payment_date ? new Date(payment.payment_date) : payment.created_at ? new Date(payment.created_at) : null
      const isOnTime =
        dueDate && paidDate ? paidDate.getTime() <= dueDate.getTime() : false

      const current = stats.get(tenantId) || { total: 0, onTime: 0, sampleDate: payment.created_at || null }
      stats.set(tenantId, {
        total: current.total + 1,
        onTime: current.onTime + (isOnTime ? 1 : 0),
        sampleDate: current.sampleDate,
      })
    })

    const tenantIds = Array.from(stats.keys())
    let profiles: Array<{ id: string; full_name: string | null }> = []
    if (tenantIds.length) {
      const { data: profileRows } = await admin
        .from('user_profiles')
        .select('id, full_name')
        .in('id', tenantIds)
      profiles = profileRows || []
    }
    const nameMap = new Map<string, string>()
    profiles.forEach((p) => nameMap.set(p.id, p.full_name || 'Tenant'))

    const ratings = Array.from(stats.entries())
      .map(([tenantId, value]) => {
        const rate = value.total > 0 ? Math.round((value.onTime / value.total) * 100) : 0
        return {
          tenant_id: tenantId,
          name: nameMap.get(tenantId) || 'Tenant',
          on_time_rate: rate,
          payments: value.total,
        }
      })
      .sort((a, b) => b.on_time_rate - a.on_time_rate || b.payments - a.payments)
      .slice(0, 10)

    return NextResponse.json({ success: true, data: ratings })
  } catch (err) {
    console.error('[TenantRatings] failed', err)
    return NextResponse.json({ success: false, error: 'Failed to load tenant ratings' }, { status: 500 })
  }
}
