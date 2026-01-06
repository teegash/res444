'use client'

import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, LockKeyhole, LogOut } from 'lucide-react'
import { useAuth } from '@/lib/auth/context'

export default function TenantSettingsPage() {
  const { signOut } = useAuth()

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Account</h1>
          <p className="text-sm text-muted-foreground">Security controls for your tenant portal.</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/dashboard/tenant">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <Card className="border-slate-200/70 bg-white/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-slate-700" />
            Password Reset
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            For your security, tenant profile details can’t be edited in the portal. To change your password, request
            a password reset link.
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button asChild className="sm:w-auto">
              <Link href="/auth/forgot-password">Request password reset</Link>
            </Button>
            <Button
              variant="outline"
              className="sm:w-auto border-slate-200 bg-white"
              onClick={() => signOut()}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
