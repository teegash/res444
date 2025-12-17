import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function TenantSecurityPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/60 via-white to-orange-50/30">
      <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8">
        <Card className="shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Security Policy</CardTitle>
            <p className="text-sm text-muted-foreground">
              This policy describes the security controls used to protect tenant data, and how the
              system aligns with Kenya’s Data Protection Act, 2019 (DPA).
            </p>
          </CardHeader>
          <CardContent className="prose prose-slate max-w-none">
            <h3>1. DPA (Kenya) alignment</h3>
            <p>
              We apply layered technical and organisational measures to protect personal data, in
              line with the DPA’s security and confidentiality expectations. This includes secure
              transmission, access control, tenant/organization data isolation, encryption, and audit
              logging.
            </p>

            <h3>2. Five-layer security model (high level)</h3>
            <ul>
              <li>
                <strong>HTTPS/TLS (in transit)</strong>: traffic is protected using HTTPS to reduce
                interception and tampering.
              </li>
              <li>
                <strong>RLS (Row Level Security)</strong>: database policies isolate data by
                organization to prevent cross-organization access.
              </li>
              <li>
                <strong>RBAC</strong>: role-based access (tenant/manager/admin/caretaker) limits what
                each user can view and do.
              </li>
              <li>
                <strong>Encryption (at rest)</strong>: where supported by underlying managed
                infrastructure, stored data is encrypted at rest (commonly using AES‑256).
              </li>
              <li>
                <strong>Audit logs</strong>: critical events (messaging, reminders, payments, and
                administrative actions) are logged for accountability and troubleshooting.
              </li>
            </ul>

            <h3>3. AES‑256: what it means (Kenya-friendly explanation)</h3>
            <p>
              AES‑256 (Advanced Encryption Standard with 256‑bit keys) is a widely used symmetric
              encryption standard approved by NIST. It is commonly used to protect sensitive data at
              rest on modern cloud platforms.
            </p>
            <ul>
              <li>
                <strong>Symmetric</strong>: the same key encrypts and decrypts data.
              </li>
              <li>
                <strong>Block cipher</strong>: processes data in 128‑bit blocks (with multiple rounds
                of mixing for security).
              </li>
              <li>
                <strong>256‑bit keys</strong>: the key space is <code>2^256</code>, which is an
                enormous number (approximately <code>1.158 × 10^77</code> possible keys).
              </li>
            </ul>
            <p>
              In practical terms, brute-forcing an AES‑256 key is considered infeasible with today’s
              computing power. This is one reason AES‑256 is widely adopted for high-security storage
              systems.
            </p>

            <h3>4. Access controls and authentication</h3>
            <ul>
              <li>Each user has a unique login; access is limited to their role and organization.</li>
              <li>Privileged actions are restricted to authorized staff.</li>
              <li>
                Session and authentication controls are designed to reduce unauthorized access.
              </li>
            </ul>

            <h3>5. Data isolation (multi-organization)</h3>
            <p>
              The system is built to prevent one organization from seeing or accessing another
              organization’s buildings, tenants, payments, invoices, water bills, maintenance, or
              reports. This is enforced through database policy and server-side scoping.
            </p>

            <h3>6. Incident response</h3>
            <p>
              If we detect suspicious access, errors, or delivery failures, we investigate using
              logs and take appropriate action. Where required by law or contract, Management may
              notify affected users and relevant authorities.
            </p>

            <h3>7. What you can do (tenant responsibilities)</h3>
            <ul>
              <li>Use a strong password and do not share your credentials.</li>
              <li>Keep your phone number updated to receive critical notices.</li>
              <li>Be cautious of messages asking for PINs or passwords (we do not request these).</li>
            </ul>

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

