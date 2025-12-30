import { createAdminClient } from '@/lib/supabase/admin'

type VacancyAlertArgs = {
  adminSupabase?: ReturnType<typeof createAdminClient>
  organizationId: string
  buildingId: string
  unitNumber?: string | null
  buildingName?: string | null
  actorUserId?: string | null
}

const ALERT_ROLES = ['admin', 'manager', 'caretaker']

export async function sendVacancyAlert({
  adminSupabase,
  organizationId,
  buildingId,
  unitNumber,
  buildingName,
  actorUserId,
}: VacancyAlertArgs) {
  if (!organizationId || !buildingId) return

  try {
    const admin = adminSupabase ?? createAdminClient()

    const { data: building, error: buildingError } = await admin
      .from('apartment_buildings')
      .select('id, name, vacancy_alerts_enabled')
      .eq('id', buildingId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (buildingError || !building?.vacancy_alerts_enabled) {
      return
    }

    const { data: members, error: membersError } = await admin
      .from('organization_members')
      .select('user_id, role')
      .eq('organization_id', organizationId)
      .in('role', ALERT_ROLES)

    if (membersError || !members?.length) {
      return
    }

    const displayBuilding = buildingName || building.name || 'property'
    const displayUnit = unitNumber || '—'
    const messageText = `Unit ${displayUnit} is now vacant at ${displayBuilding}.`

    const rows = members.map((member: any) => ({
      sender_user_id: actorUserId ?? null,
      recipient_user_id: member.user_id,
      message_text: messageText,
      related_entity_type: null,
      related_entity_id: null,
      message_type: 'in_app',
      read: false,
      organization_id: organizationId,
    }))

    await admin.from('communications').insert(rows)
  } catch (error) {
    console.error('[VacancyAlert] Failed to send vacancy notification', error)
  }
}
