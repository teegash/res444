import { Database } from './database.types'

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface User {
  id: string
  email?: string
  phone?: string
  user_metadata?: {
    full_name?: string
    avatar_url?: string
    [key: string]: any
  }
  app_metadata?: {
    provider?: string
    [key: string]: any
  }
  created_at?: string
  updated_at?: string
}

export interface Session {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at?: number
  token_type: string
  user: User
}

export interface AuthError {
  message: string
  status?: number
  name?: string
}

