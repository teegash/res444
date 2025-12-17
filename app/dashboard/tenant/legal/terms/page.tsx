import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function TenantTermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/60 via-white to-orange-50/30">
      <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8">
        <Card className="shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Terms of Use (Tenant Portal)</CardTitle>
            <p className="text-sm text-muted-foreground">
              These terms govern use of the tenant dashboard. Your lease agreement remains the
              primary contract for tenancy obligations.
            </p>
          </CardHeader>
          <CardContent className="prose prose-slate max-w-none">
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
              <Button asChild variant="outline">
                <Link href="/dashboard/tenant">Back to dashboard</Link>
              </Button>
              <Button asChild>
                <Link href="/dashboard/tenant/legal/privacy">Privacy policy</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

