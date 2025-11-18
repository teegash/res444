import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData().catch(() => null)
    const files = formData ? formData.getAll('files') : []

    const fileList = files.filter((file): file is File => file instanceof File)

    if (fileList.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please attach at least one file.' },
        { status: 400 }
      )
    }

    if (fileList.length > 3) {
      return NextResponse.json(
        { success: false, error: 'You can upload at most 3 attachments per request.' },
        { status: 400 }
      )
    }

    const adminSupabase = createAdminClient()
    const uploadedUrls: string[] = []

    for (const file of fileList) {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const extension =
        (file.name?.split('.').pop() || file.type?.split('/').pop() || 'jpg').toLowerCase()
      const filePath = `tenant-${user.id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${extension}`

      const { error: uploadError } = await adminSupabase.storage
        .from('maintenance-attachments')
        .upload(filePath, buffer, {
          contentType: file.type || 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        throw uploadError
      }

      uploadedUrls.push(filePath)
    }

    return NextResponse.json({ success: true, urls: uploadedUrls })
  } catch (error) {
    console.error('[TenantMaintenanceAttachments] Failed to upload attachments', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload attachments.',
      },
      { status: 500 }
    )
  }
}
