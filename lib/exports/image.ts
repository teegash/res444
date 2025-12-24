'use client'

export type LoadedImageData = { dataUrl: string; format: 'PNG' | 'JPEG' }

export async function loadImageAsDataUrl(url: string): Promise<LoadedImageData | null> {
  try {
    const response = await fetch(url, { cache: 'force-cache', credentials: 'include' })
    if (!response.ok) return null
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return null

    // Convert any browser-supported image (png/jpg/webp/svg) into PNG data URL for jsPDF/Excel.
    const objectUrl = URL.createObjectURL(blob)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('Failed to load image.'))
        el.src = objectUrl
      })

      const canvas = document.createElement('canvas')
      const width = Math.max(1, Math.floor(img.naturalWidth || 0))
      const height = Math.max(1, Math.floor(img.naturalHeight || 0))
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img, 0, 0, width, height)

      const pngDataUrl = canvas.toDataURL('image/png')
      if (!pngDataUrl.startsWith('data:image/')) return null
      return { dataUrl: pngDataUrl, format: 'PNG' }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}
