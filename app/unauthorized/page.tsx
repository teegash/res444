'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, Suspense } from 'react'
import { Shield, AlertTriangle, Home, ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Link from 'next/link'

function UnauthorizedContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const reason = searchParams.get('reason')
  const role = searchParams.get('role')
  const path = searchParams.get('path')

  useEffect(() => {
    // Log unauthorized access attempt
    if (typeof window !== 'undefined') {
      console.warn('Unauthorized access attempt:', {
        reason,
        role,
        path,
        timestamp: new Date().toISOString(),
      })
    }
  }, [reason, role, path])

  const getReasonMessage = () => {
    switch (reason) {
      case 'no_role':
        return {
          title: 'No Role Assigned',
          message:
            'Your account does not have a role assigned. Please contact your administrator to assign you a role.',
        }
      case 'insufficient_permissions':
        return {
          title: 'Access Denied',
          message: `You don't have permission to access this page. Your current role (${role || 'Unknown'}) does not have access to this resource.`,
        }
      case 'not_authenticated':
        return {
          title: 'Authentication Required',
          message: 'You must be signed in to access this page.',
        }
      default:
        return {
          title: 'Access Denied',
          message:
            "You don't have permission to access this resource. If you believe this is an error, please contact your administrator.",
        }
    }
  }

  const reasonInfo = getReasonMessage()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl bg-white shadow-xl">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full">
                <Shield className="w-8 h-8 text-red-600" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              403 - Access Denied
            </h1>
            <p className="text-lg text-gray-600">{reasonInfo.title}</p>
          </div>

          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{reasonInfo.message}</AlertDescription>
          </Alert>

          {reason === 'insufficient_permissions' && role && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-2">
                Your Current Role: {role.charAt(0).toUpperCase() + role.slice(1)}
              </h3>
              <p className="text-sm text-blue-800">
                Different roles have access to different parts of the system:
              </p>
              <ul className="mt-2 text-sm text-blue-800 list-disc list-inside space-y-1">
                <li>
                  <strong>Admin:</strong> Full system access
                </li>
                <li>
                  <strong>Manager:</strong> Organization-level access
                </li>
                <li>
                  <strong>Caretaker:</strong> Building-level access
                </li>
                <li>
                  <strong>Tenant:</strong> Personal access only
                </li>
              </ul>
            </div>
          )}

          {path && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>Attempted path:</strong> {path}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => router.back()}
              variant="outline"
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </Button>

            <Link href="/dashboard">
              <Button className="flex items-center gap-2 w-full sm:w-auto">
                <Home className="w-4 h-4" />
                Go to Dashboard
              </Button>
            </Link>

            {reason === 'no_role' && (
              <Link href="/auth/login">
                <Button variant="outline" className="flex items-center gap-2">
                  Sign Out
                </Button>
              </Link>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center">
              Need help? Contact your system administrator or{' '}
              <Link href="/support" className="text-blue-600 hover:underline">
                support team
              </Link>
              .
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default function UnauthorizedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <UnauthorizedContent />
    </Suspense>
  )
}

