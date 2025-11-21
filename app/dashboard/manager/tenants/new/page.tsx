'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserPlus, ArrowLeft, Calendar } from 'lucide-react'

export default function AddTenantPage() {
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push('/dashboard/tenants')
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <UserPlus className="w-7 h-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Add New Tenant</h1>
        </div>
      </div>

      <Card className="p-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Personal Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Tenant Information</h3>
            <p className="text-sm text-gray-600 mb-4">Enter the details for the new tenant</p>

            <div className="space-y-4">
              <div className="text-base font-semibold text-gray-900">Personal Information</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" placeholder="John" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" placeholder="Kamau" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" placeholder="john@email.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" placeholder="254712345678" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nationalId">National ID Number</Label>
                <Input id="nationalId" placeholder="12345678" required />
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div>
            <div className="text-base font-semibold text-gray-900 mb-4">Emergency Contact</div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="emergencyName">Contact Name</Label>
                  <Input id="emergencyName" placeholder="Jane Kamau" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergencyPhone">Contact Phone</Label>
                  <Input id="emergencyPhone" placeholder="254712345679" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="relationship">Relationship</Label>
                <Select>
                  <SelectTrigger id="relationship">
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spouse">Spouse</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="sibling">Sibling</SelectItem>
                    <SelectItem value="friend">Friend</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Rental Information */}
          <div>
            <div className="text-base font-semibold text-gray-900 mb-4">Rental Information</div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="property">Property</Label>
                  <Select>
                    <SelectTrigger id="property">
                      <SelectValue placeholder="Select property" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Kilimani Heights</SelectItem>
                      <SelectItem value="2">Westlands Plaza</SelectItem>
                      <SelectItem value="3">Karen Villas</SelectItem>
                      <SelectItem value="4">Eastlands Court</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit Number</Label>
                  <Select>
                    <SelectTrigger id="unit">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A-101">A-101</SelectItem>
                      <SelectItem value="A-102">A-102</SelectItem>
                      <SelectItem value="B-201">B-201</SelectItem>
                      <SelectItem value="B-202">B-202</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rent">Monthly Rent (KES)</Label>
                  <Input id="rent" type="number" placeholder="45000" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deposit">Security Deposit (KES)</Label>
                  <Input id="deposit" type="number" placeholder="90000" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="moveIn">Move-in Date</Label>
                  <div className="relative">
                    <Input id="moveIn" type="date" required />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leaseEnd">Lease End Date</Label>
                  <div className="relative">
                    <Input id="leaseEnd" type="date" required />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional information about the tenant..."
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-gray-900 hover:bg-gray-800">
              Add Tenant
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
