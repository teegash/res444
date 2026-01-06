import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function TenantPrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-blue-500 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-5xl rounded-xl border border-blue-200 bg-white shadow-2xl">
        <div className="px-6 py-8 sm:px-10 sm:py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Privacy Policy</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Applies to the tenant portal and related communications (in-app and SMS). This policy
                is designed for users in Kenya and references the Kenya Data Protection Act, 2019.
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
            <h3>1. Who we are</h3>
            <p>
              The tenant portal is provided by your property management organization (“Management”).
              Management is the primary data controller for tenant information processed in this
              portal. Our platform may act as a data processor on Management’s instructions.
            </p>

            <h3>2. Information we collect</h3>
            <ul>
              <li>
                Identity and profile data: name, phone number, email (if available), profile image.
              </li>
              <li>
                Tenancy data: lease details, unit/building, invoices, statements, arrears/prepayment
                status.
              </li>
              <li>
                Payment and transaction data: payment references, amounts, dates, verification state.
                We do not store your mobile money PIN.
              </li>
              <li>
                Communications: messages between you and Management (in-app), delivery status for
                SMS reminders, and related logs.
              </li>
              <li>
                Device and usage data: basic security logs, timestamps, and activity necessary for
                audit and fraud prevention.
              </li>
            </ul>

            <h3>3. Why we process your data (purposes)</h3>
            <ul>
              <li>To provide tenant services: invoices, receipts, statements, and maintenance requests.</li>
              <li>To support rent and bill reminders and important service notices.</li>
              <li>To verify and reconcile payments and prevent fraud.</li>
              <li>To secure accounts and enforce access controls.</li>
              <li>To improve service reliability and customer support.</li>
            </ul>

            <h3>4. Legal basis</h3>
            <p>
              We process data based on one or more of the following: performance of a contract
              (lease/tenant services), legitimate interests (security, fraud prevention, service
              operations), compliance with legal obligations, and consent (particularly for certain
              communications where required).
            </p>

            <h3>5. Sharing and disclosures</h3>
            <p>We may share limited data with:</p>
            <ul>
              <li>Your Management team and authorized staff within your organization.</li>
              <li>
                Service providers for SMS delivery (e.g., Africa’s Talking) and infrastructure
                hosting, strictly for providing the service.
              </li>
              <li>Payment partners where applicable to verify transactions.</li>
              <li>Authorities where required by Kenyan law or lawful requests.</li>
            </ul>

            <h3>6. International transfers</h3>
            <p>
              Some service providers may process data outside Kenya. Where this occurs, we apply
              appropriate safeguards and contractual protections.
            </p>

            <h3>7. Data retention</h3>
            <p>
              We retain data as long as needed for tenancy management, legal obligations, dispute
              resolution, audit trails, and security. Retention periods may vary by record type
              (e.g., payments/receipts vs. support logs).
            </p>

            <h3>8. Security</h3>
            <p>
              We implement technical and organizational measures to protect your data, including
              access controls, encryption in transit where supported, and audit logging. No system is
              completely secure; please use strong passwords and keep your login details private.
            </p>

            <h3>9. Your rights (Kenya)</h3>
            <p>
              Subject to applicable law, you may request access, correction, deletion, restriction,
              or objection to processing, and you may withdraw consent where consent is the basis.
              You may also lodge a complaint with Kenya’s Office of the Data Protection Commissioner
              (ODPC).
            </p>

            <h3>10. Cookies and similar technologies</h3>
            <p>
              The portal may use essential cookies/session storage for authentication and security.
              We do not use cookies to sell personal data. For more details, see the Cookie Notice.
            </p>

            <h3>11. Changes to this policy</h3>
            <p>
              We may update this policy from time to time. We will post updates in the portal with
              an updated effective date.
            </p>

            <h3>12. Contact</h3>
            <p>
              For privacy questions or requests, contact your Management office through the portal’s
              communications channels.
            </p>

            <div className="not-prose mt-8 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/tenant/legal/consent">View consent</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
