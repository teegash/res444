import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: 'No file provided',
        },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.',
        },
        { status: 400 }
      )
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          success: false,
          error: 'File size exceeds 5MB limit',
        },
        { status: 400 }
      )
    }

    // Use admin client to bypass RLS and speed up uploads
    const supabase = createAdminClient()

    // Generate unique filename
    const timestamp = Date.now()
    const fileExtension = file.name.split('.').pop()
    const fileName = `organizations/${timestamp}-${Math.random().toString(36).substring(7)}.${fileExtension}`

    // Convert file to ArrayBuffer (more efficient for large files)
    const arrayBuffer = await file.arrayBuffer()

    // Check available buckets and determine the correct bucket name
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
    
    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError)
      // Continue anyway, will try default bucket name
    }
    
    const bucketNames = buckets?.map(b => b.name) || []
    
    // Try to find the correct bucket name (support both naming conventions)
    let bucketName = bucketNames.find(b => b === 'profile_pictures') || 
                     bucketNames.find(b => b === 'profile-pictures') ||
                     'profile_pictures' // Default fallback

    console.log('Available buckets:', bucketNames)
    console.log('Using bucket:', bucketName)
    
    // If bucket doesn't exist in the list, provide helpful error
    if (bucketNames.length > 0 && !bucketNames.includes(bucketName)) {
      return NextResponse.json(
        {
          success: false,
          error: `Storage bucket "${bucketName}" not found. Available buckets: ${bucketNames.join(', ')}. Please create the bucket in Supabase Dashboard.`,
        },
        { status: 404 }
      )
    }

    // Upload to profile_pictures bucket
    // Using admin client bypasses RLS and is faster
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, arrayBuffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      console.error('Error uploading logo:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Failed to upload logo. Please ensure the storage bucket exists.',
        },
        { status: 500 }
      )
    }

    // Get public URL immediately
    const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName)

    return NextResponse.json(
      {
        success: true,
        url: urlData.publicUrl,
        path: data.path,
      },
      { status: 200 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Logo upload error:', err)

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}

