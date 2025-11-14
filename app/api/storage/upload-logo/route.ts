import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Generate presigned URL for direct client-side upload
 * This avoids Vercel serverless function timeout limits
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileName, contentType, fileSize } = body

    if (!fileName || !contentType) {
      return NextResponse.json(
        {
          success: false,
          error: 'File name and content type are required',
        },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(contentType)) {
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
    if (fileSize && fileSize > maxSize) {
      return NextResponse.json(
        {
          success: false,
          error: 'File size exceeds 5MB limit',
        },
        { status: 400 }
      )
    }

    // Use admin client to generate presigned URL
    const supabase = createAdminClient()

    // Check available buckets and determine the correct bucket name
    const { data: buckets } = await supabase.storage.listBuckets()
    const bucketNames = buckets?.map(b => b.name) || []
    
    // Try to find the correct bucket name (support both naming conventions)
    let bucketName = bucketNames.find(b => b === 'profile_pictures') || 
                     bucketNames.find(b => b === 'profile-pictures') ||
                     'profile_pictures' // Default fallback

    // Generate unique file path
    const timestamp = Date.now()
    const fileExtension = fileName.split('.').pop()
    const filePath = `organizations/${timestamp}-${Math.random().toString(36).substring(7)}.${fileExtension}`

    // Create presigned URL for upload (valid for 5 minutes)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUploadUrl(filePath)

    if (signedUrlError) {
      console.error('Error creating presigned URL:', signedUrlError)
      return NextResponse.json(
        {
          success: false,
          error: signedUrlError.message || 'Failed to generate upload URL',
        },
        { status: 500 }
      )
    }

    // Get public URL for the file (will be available after upload)
    const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filePath)

    return NextResponse.json(
      {
        success: true,
        uploadUrl: signedUrlData.signedUrl,
        token: signedUrlData.token,
        path: filePath,
        publicUrl: urlData.publicUrl,
        bucket: bucketName,
      },
      { status: 200 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Presigned URL generation error:', err)

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}

