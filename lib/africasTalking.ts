import africastalking from 'africastalking'

let smsClient: ReturnType<typeof africastalking>['SMS'] | null = null

export function getSmsClient() {
  if (smsClient) {
    return smsClient
  }

  const username =
    process.env.AT_SANDBOX_USERNAME ||
    process.env.AT_USERNAME
  const apiKey =
    process.env.AT_SANDBOX_API_KEY ||
    process.env.AT_API_KEY

  if (!username || !apiKey) {
    throw new Error(
      'Africa\'s Talking credentials are missing. Set AT_SANDBOX_USERNAME and AT_SANDBOX_API_KEY (or live variants).'
    )
  }

  const at = africastalking({
    username,
    apiKey,
  })

  smsClient = at.SMS
  return smsClient
}
