import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function TenantTermsPage() {
  return (
    <div className="min-h-screen bg-blue-500 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-5xl rounded-xl border border-blue-200 bg-white shadow-2xl">
        <div className="px-6 py-8 sm:px-10 sm:py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Terms of Use (Tenant Portal)</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                These terms govern use of the tenant dashboard. Your lease agreement remains the
                primary contract for tenancy obligations.
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
            <h3>1. Eligibility and accounts</h3>
            <p>
              The tenant portal is intended for verified tenants and authorized users. You are
              responsible for keeping your login credentials confidential and for activities under
              your account.
            </p>

            <h3>2. Acceptable use</h3>
            <ul>
              <li>Do not misuse the portal to harass staff or other tenants.</li>
              <li>Do not attempt to access other tenants’ data or bypass security controls.</li>
              <li>Do not upload unlawful or harmful content.</li>
            </ul>

            <h3>3. Payments and statements</h3>
            <p>
              The portal provides a record of invoices, payments, and statements. Where mobile money
              or bank transfer verification is required, records may appear as “pending” until
              verified by Management.
            </p>

            <h3>4. Maintenance requests</h3>
            <p>
              Maintenance requests submitted through the portal are routed to Management. Response
              times depend on severity, access, and staffing. Emergency issues should also be
              reported through the emergency contact methods provided by Management.
            </p>

            <h3>5. Availability</h3>
            <p>
              The portal may be unavailable due to maintenance, outages, or network issues. We may
              update features without notice to improve security and reliability.
            </p>

            <h3>6. Limitation of liability</h3>
            <p>
              To the extent permitted by Kenyan law, Management and platform providers are not liable
              for indirect losses arising from portal downtime, delayed notifications, or third-party
              service interruptions. Nothing limits liability that cannot be limited by law.
            </p>

            <h3>7. Governing law</h3>
            <p>These terms are governed by the laws of Kenya.</p>

            <div className="not-prose mt-8 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/tenant/legal/privacy">Privacy policy</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
