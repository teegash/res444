import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function TenantCookieNoticePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100/70">
      <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-10">
        <Card className="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm">
          <CardHeader className="space-y-2 border-b border-slate-100/80 bg-slate-50/70">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Tenant Portal Policy</p>
            <CardTitle className="text-xl font-semibold tracking-tight">Cookie Notice</CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Explains how the tenant portal uses cookies and similar technologies.
            </p>
          </CardHeader>
          <CardContent className="prose prose-slate prose-sm max-w-none leading-relaxed prose-headings:text-[15px] prose-headings:font-semibold prose-headings:tracking-tight prose-li:leading-6 prose-p:leading-7">
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
              <Button asChild variant="outline">
                <Link href="/dashboard/tenant" className="inline-flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Link>
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
