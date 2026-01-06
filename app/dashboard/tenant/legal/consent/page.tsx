import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function TenantConsentPage() {
  return (
    <div className="min-h-screen bg-blue-500 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-5xl rounded-xl border border-blue-200 bg-white shadow-2xl">
        <div className="px-6 py-8 sm:px-10 sm:py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Consent & Communications</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                This consent explains how you may receive service messages (in-app and SMS) and how to
                manage your preferences. It is intended for Kenyan tenants and aligns with common ODPC
                expectations.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href="/dashboard/tenant">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
          </div>

          <div className="mt-6 h-px bg-slate-200" />

          <div className="prose prose-slate mt-6 max-w-none text-[15px] leading-7 prose-headings:text-base prose-headings:font-semibold prose-li:leading-7">
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
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/tenant/legal/privacy">View privacy policy</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
