import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function TenantConsentPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/60 via-white to-orange-50/30">
      <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8">
        <Card className="shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Consent & Communications</CardTitle>
            <p className="text-sm text-muted-foreground">
              This consent explains how you may receive service messages (in-app and SMS) and how to
              manage your preferences. It is intended for Kenyan tenants and aligns with common ODPC
              expectations.
            </p>
          </CardHeader>
          <CardContent className="prose prose-slate max-w-none">
            <h3>1. What you are consenting to</h3>
            <p>By using the tenant portal, you acknowledge and consent to:</p>
            <ul>
              <li>Receiving in-app messages related to your tenancy and support requests.</li>
              <li>
                Receiving SMS messages (where enabled by Management) for important notices such as:
                rent reminders, overdue notices, maintenance updates, and critical service alerts.
              </li>
              <li>
                Processing of your contact details (phone number and name) to deliver these messages.
              </li>
            </ul>

            <h3>2. What is not marketing</h3>
            <p>
              These communications are intended to be service-related and tenancy-related. We do not
              use your number for unrelated marketing without appropriate consent.
            </p>

            <h3>3. Message frequency</h3>
            <p>
              Reminder frequency depends on invoice status and the organization’s configured stages.
              You may receive multiple reminders if an invoice remains unpaid or overdue.
            </p>

            <h3>4. Withdrawing consent / opting out</h3>
            <p>
              You can request changes to communication preferences by contacting Management via the
              portal. If SMS is disabled, you will still receive essential in-app notices necessary
              to provide the service.
            </p>

            <h3>5. Accuracy of contact details</h3>
            <p>
              You are responsible for keeping your phone number up-to-date. If your number changes,
              update your profile (where available) or notify Management.
            </p>

            <h3>6. Delivery limitations</h3>
            <p>
              SMS delivery depends on mobile network availability and the SMS provider. Delayed or
              failed delivery may occur.
            </p>

            <h3>7. Payment and transaction notifications</h3>
            <p>
              Where payment notifications are used, they may include limited details (amount and
              date). Sensitive credentials (such as PINs) are never requested via SMS.
            </p>

            <div className="not-prose mt-8 flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/dashboard/tenant">Back to dashboard</Link>
              </Button>
              <Button asChild>
                <Link href="/dashboard/tenant/legal/privacy">View privacy policy</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

