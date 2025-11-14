'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Building2, Shield, Crown } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const [accountType, setAccountType] = useState<'tenant' | 'manager'>('tenant')
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Redirect based on account type
    if (accountType === 'tenant') {
      router.push('/dashboard/tenant')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2 pb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Building2 className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-blue-600">RentalKenya</h1>
              <p className="text-sm text-gray-600">Premium Property Management</p>
            </div>
          </div>
          <h2 className="text-xl font-bold">Create Account</h2>
          {accountType === 'tenant' ? (
            <p className="text-sm text-muted-foreground bg-blue-50 p-3 rounded-lg border border-blue-200">
              <span className="font-semibold text-blue-700">Tenant Account:</span> Contact your caretaker to get account credentials
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Join our premium rental management platform</p>
          )}
        </CardHeader>
        
        <CardContent>
          {accountType === 'manager' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Account Type Selection */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setAccountType('tenant')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    accountType === 'tenant'
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Shield className={`h-6 w-6 mx-auto mb-2 ${accountType === 'tenant' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <p className="font-medium text-sm">Tenant</p>
                </button>
                
                <button
                  type="button"
                  onClick={() => setAccountType('manager')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    accountType === 'manager'
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Crown className={`h-6 w-6 mx-auto mb-2 ${accountType === 'manager' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <p className="font-medium text-sm">Manager</p>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" placeholder="John" required />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" placeholder="Kamau" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="john@email.com" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" placeholder="254712345678" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required />
              </div>

              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                <Shield className="h-4 w-4 mr-2" />
                Create {accountType === 'tenant' ? 'Tenant' : 'Manager'} Account
              </Button>
            </form>
          ) : (
            <div className="text-center py-8">
              <Shield className="h-16 w-16 mx-auto mb-4 text-blue-600" />
              <h3 className="font-semibold mb-2">Tenant Registration</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Please contact your property caretaker or manager to receive your login credentials.
              </p>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link href="/login" className="text-blue-600 hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
