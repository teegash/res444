import AfricasTalking from 'africastalking'

let smsClient: ReturnType<typeof AfricasTalking>['SMS'] | null = null

export function getSmsClient() {
  if (smsClient) {
    return smsClient
  }

  const username =
    process.env.AT_SANDBOX_USERNAME ||
    process.env.AT_USERNAME ||
    'sandbox'
  const apiKey =
    process.env.AT_SANDBOX_API_KEY ||
    process.env.AT_API_KEY

  if (!apiKey) {
    throw new Error(
      "Africa's Talking credentials are missing. Set AT_SANDBOX_API_KEY (or AT_API_KEY for production)."
    )
  }

  const africasTalking = AfricasTalking({
    apiKey,
    username,
  })

  smsClient = africasTalking.SMS
  return smsClient
}
