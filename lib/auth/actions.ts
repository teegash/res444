'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthError } from '@/lib/supabase/types'

export interface SignUpResult {
  success: boolean
  error?: string
  message?: string
}

export interface SignInResult {
  success: boolean
  error?: string
  message?: string
}

export async function signUp(
  email: string,
  password: string,
  options?: {
    fullName?: string
    phone?: string
    redirectTo?: string
  }
): Promise<SignUpResult> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: options?.redirectTo || `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
        data: {
          full_name: options?.fullName,
          phone: options?.phone,
        },
      },
    })

    if (error) {
      return {
        success: false,
        error: error.message,
      }
    }

    if (data.user && !data.session) {
      // Email verification required
      return {
        success: true,
        message: 'Please check your email to verify your account.',
      }
    }

    if (data.session) {
      revalidatePath('/', 'layout')
      redirect(options?.redirectTo || '/dashboard')
    }

    return {
      success: true,
      message: 'Account created successfully.',
    }
  } catch (error) {
    const authError = error as AuthError
    return {
      success: false,
      error: authError.message || 'An unexpected error occurred',
    }
  }
}

export async function signIn(
  email: string,
  password: string,
  redirectTo?: string
): Promise<SignInResult> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return {
        success: false,
        error: error.message,
      }
    }

    if (data.session) {
      revalidatePath('/', 'layout')
      redirect(redirectTo || '/dashboard')
    }

    return {
      success: false,
      error: 'Failed to create session',
    }
  } catch (error) {
    const authError = error as AuthError
    return {
      success: false,
      error: authError.message || 'An unexpected error occurred',
    }
  }
}

export async function signOut() {
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut()

    if (error) {
      return {
        success: false,
        error: error.message,
      }
    }

    revalidatePath('/', 'layout')
    redirect('/auth/login')
  } catch (error) {
    const authError = error as AuthError
    return {
      success: false,
      error: authError.message || 'An unexpected error occurred',
    }
  }
}

export async function getSession() {
  try {
    const supabase = await createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session
  } catch (error) {
    return null
  }
}

export async function getUser() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user
  } catch (error) {
    return null
  }
}

export async function updatePassword(newPassword: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      return {
        success: false,
        error: error.message,
      }
    }

    return {
      success: true,
      message: 'Password updated successfully.',
    }
  } catch (error) {
    const authError = error as AuthError
    return {
      success: false,
      error: authError.message || 'An unexpected error occurred',
    }
  }
}
