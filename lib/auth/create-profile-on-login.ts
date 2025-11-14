/**
 * Creates user profile and organization member if they don't exist
 * Called on first login if profile/member is missing
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface CreateProfileOnLoginResult {
  profileCreated: boolean
  memberCreated: boolean
  error?: string
}

export async function createProfileOnLogin(
  userId: string,
  userMetadata: {
    full_name?: string
    phone?: string
    role?: string
    building_id?: string
  },
  organizationId?: string
): Promise<CreateProfileOnLoginResult> {
  const result: CreateProfileOnLoginResult = {
    profileCreated: false,
    memberCreated: false,
  }

  try {
    const supabase = createAdminClient()

    // Check if profile exists (should exist if trigger is working, but check anyway)
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('user_profiles')
      .select('id, full_name, phone_number')
      .eq('id', userId)
      .maybeSingle()

    // Create or update profile if it doesn't exist or is incomplete
    if (!existingProfile) {
      try {
        const profileData = {
          id: userId,
          full_name: userMetadata.full_name || '',
          phone_number: userMetadata.phone || '',
          updated_at: new Date().toISOString(),
        }

        const { error: profileError } = await supabase.from('user_profiles').insert(profileData)

        if (!profileError) {
          result.profileCreated = true
          console.log('✓ Profile created on first login')
        } else {
          // If insert fails (e.g., duplicate key), try update instead
          if (profileError.code === '23505') {
            const { error: updateError } = await supabase
              .from('user_profiles')
              .update({
                full_name: userMetadata.full_name || existingProfile?.full_name || '',
                phone_number: userMetadata.phone || existingProfile?.phone_number || '',
                updated_at: new Date().toISOString(),
              })
              .eq('id', userId)

            if (!updateError) {
              result.profileCreated = true
              console.log('✓ Profile updated on first login')
            } else {
              console.warn('⚠ Failed to update profile on login:', updateError.message)
            }
          } else {
            console.warn('⚠ Failed to create profile on login:', profileError.message)
          }
        }
      } catch (err: any) {
        console.warn('⚠ Profile creation error on login:', err.message)
      }
    } else {
      result.profileCreated = true // Profile already exists
      
      // Update profile if metadata has more complete information
      if ((userMetadata.full_name && existingProfile.full_name !== userMetadata.full_name) ||
          (userMetadata.phone && existingProfile.phone_number !== userMetadata.phone)) {
        try {
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
              full_name: userMetadata.full_name || existingProfile.full_name,
              phone_number: userMetadata.phone || existingProfile.phone_number,
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId)

          if (!updateError) {
            console.log('✓ Profile updated with metadata on login')
          }
        } catch (err: any) {
          console.warn('⚠ Failed to update profile on login:', err.message)
        }
      }
    }

    // Create organization member if organizationId is provided and member doesn't exist
    if (organizationId && userMetadata.role) {
      const { data: existingMember } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .maybeSingle()

      if (!existingMember) {
        try {
          const { error: memberError } = await supabase.from('organization_members').insert({
            user_id: userId,
            organization_id: organizationId,
            role: userMetadata.role,
            joined_at: new Date().toISOString(),
          })

          if (!memberError) {
            result.memberCreated = true
            console.log('✓ Organization member created on first login')
          } else {
            console.warn('⚠ Failed to create member on login:', memberError.message)
          }
        } catch (err: any) {
          console.warn('⚠ Member creation error on login:', err.message)
        }
      } else {
        result.memberCreated = true // Member already exists
      }
    }

    return result
  } catch (error: any) {
    return {
      ...result,
      error: error.message || 'Failed to create profile/member on login',
    }
  }
}

