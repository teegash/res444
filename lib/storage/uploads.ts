
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface UploadFileResult {
  success: boolean
  url?: string
  path?: string
  error?: string
}

export interface FileValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate file before upload
 */
export function validateFile(
  file: File,
  options: {
    maxSizeMB?: number
    allowedTypes?: string[]
    allowedExtensions?: string[]
  } = {}
): FileValidationResult {
  const {
    maxSizeMB = 5,
    allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
    allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'],
  } = options

  // Check file size
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${maxSizeMB}MB`,
    }
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty',
    }
  }

  // Check file type
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
    }
  }

  // Check file extension
  const fileName = file.name.toLowerCase()
  const hasValidExtension = allowedExtensions.some((ext) => fileName.endsWith(ext.toLowerCase()))

  if (!hasValidExtension) {
    return {
      valid: false,
      error: `File extension not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`,
    }
  }

  return { valid: true }
}

/**
 * Generate unique file path
 */
function generateFilePath(
  bucket: string,
  userId: string,
  fileName: string,
  prefix?: string
): string {
  const timestamp = Date.now()
  const randomString = Math.random().toString(36).substring(2, 15)
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const extension = sanitizedFileName.substring(sanitizedFileName.lastIndexOf('.'))
  const baseName = sanitizedFileName.substring(0, sanitizedFileName.lastIndexOf('.')) || 'file'

  const pathPrefix = prefix ? `${prefix}/` : ''
  return `${pathPrefix}${userId}/${timestamp}_${randomString}_${baseName}${extension}`
}

/**
 * Upload file to Supabase Storage
 */
export async function uploadFile(
  bucket: string,
  file: File | Blob,
  filePath: string,
  options: {
    useAdminClient?: boolean
    contentType?: string
    cacheControl?: string
  } = {}
): Promise<UploadFileResult> {
  try {
    const { useAdminClient = false, contentType, cacheControl } = options

    // Get appropriate client
    const supabase = useAdminClient ? createAdminClient() : await createClient()

    // Convert File/Blob to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer()
    
    // Upload file (Supabase accepts ArrayBuffer, Blob, or File)
    const { data, error } = await supabase.storage.from(bucket).upload(filePath, arrayBuffer, {
      contentType: contentType || (file instanceof File ? file.type : 'application/octet-stream'),
      cacheControl: cacheControl || '3600',
      upsert: false, // Don't overwrite existing files
    })

    if (error) {
      console.error('Error uploading file:', error)
      return {
        success: false,
        error: error.message || 'Failed to upload file',
      }
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)

    return {
      success: true,
      url: urlData.publicUrl,
      path: data.path,
    }
  } catch (error) {
    const err = error as Error
    console.error('Error in uploadFile:', err)
    return {
      success: false,
      error: err.message || 'Failed to upload file',
    }
  }
}

/**
 * Upload deposit slip to Supabase Storage
 */
export async function uploadDepositSlip(
  file: File,
  userId: string,
  paymentId?: string
): Promise<UploadFileResult> {
  try {
    // Validate file
    const validation = validateFile(file, {
      maxSizeMB: 5,
      allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
    })

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error || 'File validation failed',
      }
    }

    // Generate file path
    const prefix = paymentId ? `payment-${paymentId}` : 'pending'
    const filePath = generateFilePath('deposit-slips', userId, file.name, prefix)

    // Upload file
    const result = await uploadFile('deposit-slips', file, filePath, {
      contentType: file.type,
    })

    return result
  } catch (error) {
    const err = error as Error
    console.error('Error uploading deposit slip:', err)
    return {
      success: false,
      error: err.message || 'Failed to upload deposit slip',
    }
  }
}

/**
 * Delete file from Supabase Storage
 */
export async function deleteFile(
  bucket: string,
  filePath: string,
  options: { useAdminClient?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const { useAdminClient = false } = options
    const supabase = useAdminClient ? createAdminClient() : await createClient()

    const { error } = await supabase.storage.from(bucket).remove([filePath])

    if (error) {
      console.error('Error deleting file:', error)
      return {
        success: false,
        error: error.message || 'Failed to delete file',
      }
    }

    return { success: true }
  } catch (error) {
    const err = error as Error
    console.error('Error in deleteFile:', err)
    return {
      success: false,
      error: err.message || 'Failed to delete file',
    }
  }
}

/**
 * Get signed URL for private file (temporary access)
 */
export async function getSignedUrl(
  bucket: string,
  filePath: string,
  expiresIn: number = 3600
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, expiresIn)

    if (error) {
      console.error('Error creating signed URL:', error)
      return {
        success: false,
        error: error.message || 'Failed to create signed URL',
      }
    }

    return {
      success: true,
      url: data.signedUrl,
    }
  } catch (error) {
    const err = error as Error
    console.error('Error in getSignedUrl:', err)
    return {
      success: false,
      error: err.message || 'Failed to create signed URL',
    }
  }
}

