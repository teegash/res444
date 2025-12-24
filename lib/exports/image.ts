'use client'

export type LoadedImageData = { dataUrl: string; format: 'PNG' | 'JPEG' }

function guessFormatFromMime(mime: string | null): LoadedImageData['format'] {
  const m = (mime || '').toLowerCase()
  if (m.includes('png')) return 'PNG'
  return 'JPEG'
}

export async function loadImageAsDataUrl(url: string): Promise<LoadedImageData | null> {
  try {
    const response = await fetch(url, { cache: 'force-cache', credentials: 'include' })
    if (!response.ok) return null
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return null

    const format = guessFormatFromMime(blob.type)
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Failed to read image.'))
      reader.onload = () => resolve(String(reader.result || ''))
      reader.readAsDataURL(blob)
    })

    if (!dataUrl.startsWith('data:image/')) return null
    return { dataUrl, format }
  } catch {
    return null
  }
}

