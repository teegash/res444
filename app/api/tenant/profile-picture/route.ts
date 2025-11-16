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
    const file = formData?.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'Image file is required.' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const adminSupabase = createAdminClient()
    const extension =
      (file.name?.split('.').pop() || file.type?.split('/').pop() || 'jpg').toLowerCase()
    const filePath = `tenant-profiles/${user.id}-${Date.now()}.${extension}`

    const { error: uploadError } = await adminSupabase.storage.from('profile-pictures').upload(filePath, buffer, {
      contentType: file.type || 'image/jpeg',
      cacheControl: '3600',
      upsert: true,
    })

    if (uploadError) {
      throw uploadError
    }

    const { data: publicUrlData } = adminSupabase.storage.from('profile-pictures').getPublicUrl(filePath)
    const publicUrl = publicUrlData?.publicUrl || null

    if (!publicUrl) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate profile image URL.' },
        { status: 500 }
      )
    }

    const { error: updateError } = await adminSupabase
      .from('user_profiles')
      .update({ profile_picture_url: publicUrl })
      .eq('id', user.id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true, url: publicUrl })
  } catch (error) {
    console.error('[TenantProfilePicture] Failed to upload profile image', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload profile image.',
      },
      { status: 500 }
    )
  }
}
