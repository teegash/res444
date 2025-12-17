import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function TenantCookieNoticePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/60 via-white to-orange-50/30">
      <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8">
        <Card className="shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Cookie Notice</CardTitle>
            <p className="text-sm text-muted-foreground">
              Explains how the tenant portal uses cookies and similar technologies.
            </p>
          </CardHeader>
          <CardContent className="prose prose-slate max-w-none">
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

