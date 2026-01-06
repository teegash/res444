import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function TenantCookieNoticePage() {
  return (
    <div className="min-h-screen bg-blue-500 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-5xl rounded-xl border border-blue-200 bg-white shadow-2xl">
        <div className="px-6 py-8 sm:px-10 sm:py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Cookie Notice</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Explains how the tenant portal uses cookies and similar technologies.
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
            <h3>1. What we use</h3>
            <p>
              The tenant portal uses essential cookies or similar storage to keep you signed in,
              protect against fraud, and maintain security settings.
            </p>

            <h3>2. Essential vs optional</h3>
            <p>
              Essential cookies are required for the portal to function. Optional analytics cookies
              may be used only if enabled by Management and where lawful.
            </p>

            <h3>3. Managing cookies</h3>
            <p>
              You can manage cookies via your browser settings. Disabling essential cookies may stop
              the portal from working correctly.
            </p>

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
