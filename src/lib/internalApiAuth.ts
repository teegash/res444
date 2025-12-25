export function requireInternalApiKey(req: Request) {
  const expected = process.env.INTERNAL_API_KEY
  if (!expected) throw new Error('Server misconfigured: INTERNAL_API_KEY missing')

  const auth = req.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }

  const token = auth.slice('Bearer '.length).trim()
  if (token !== expected) {
    throw new Error('Forbidden')
  }
}

