import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    // find organization for user
    const { data: membership, error: membershipError } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (membershipError) throw membershipError
    if (!membership?.organization_id) {
      return NextResponse.json({ success: true, data: [] })
    }

    const orgId = membership.organization_id
    const { data: members, error: membersError } = await admin
      .from('organization_members')
      .select('user_id, role')
      .eq('organization_id', orgId)
    if (membersError) throw membersError

    const userIds = (members || []).map((m) => m.user_id)
    let profiles: Record<string, { full_name: string | null }> = {}
    if (userIds.length > 0) {
      const { data: profileRows, error: profileError } = await admin
        .from('user_profiles')
        .select('id, full_name')
        .in('id', userIds)
      if (profileError) throw profileError
      profiles = Object.fromEntries(
        (profileRows || []).map((p: any) => [p.id, { full_name: p.full_name }])
      )
    }

    // Emails from auth
    const emails: Record<string, string | null> = {}
    for (const userId of userIds) {
      try {
        const { data } = await admin.auth.admin.getUserById(userId)
        emails[userId] = data.user?.email ?? null
      } catch {
        emails[userId] = profiles[userId]?.email ?? null
      }
    }

    const result = (members || []).map((m) => ({
      id: m.user_id,
      role: m.role,
      full_name: profiles[m.user_id]?.full_name ?? null,
      email: emails[m.user_id] ?? null,
    }))

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('[Settings.Team.GET] failed', error)
    return NextResponse.json({ success: false, error: 'Failed to load team.' }, { status: 500 })
  }
}
