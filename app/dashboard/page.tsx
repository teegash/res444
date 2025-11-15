'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Crown, Building2, Users, DollarSign, Wrench } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Line, LineChart, Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, Pie, PieChart } from 'recharts'
import { OrganizationSetupModal } from '@/components/dashboard/organization-setup-modal'
import { useAuth } from '@/lib/auth/context'

const revenueData = [
  { month: 'Jul', revenue: 800000, expenses: 520000 },
  { month: 'Aug', revenue: 850000, expenses: 525000 },
  { month: 'Sep', revenue: 820000, expenses: 520000 },
  { month: 'Oct', revenue: 900000, expenses: 530000 },
  { month: 'Nov', revenue: 950000, expenses: 535000 },
  { month: 'Dec', revenue: 1000000, expenses: 540000 },
]

const propertyRevenueData = [
  { name: 'Westlands', revenue: 1000000 },
  { name: 'Karen', revenue: 750000 },
  { name: 'Eastlands', revenue: 500000 },
  { name: 'Kilimani', revenue: 350000 },
]

const paymentData = [
  { name: 'Paid', value: 44, color: '#22c55e' },
  { name: 'Pending', value: 3, color: '#eab308' },
  { name: 'Overdue', value: 1, color: '#ef4444' },
]

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
          Loading dashboard...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  )
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const setupParam = searchParams.get('setup')
  const [showSetupModal, setShowSetupModal] = useState(setupParam === '1')
  const { user } = useAuth()
  const [organization, setOrganization] = useState<{
    id: string
    name: string
    email: string
    phone: string | null
    location: string | null
    registration_number: string | null
    logo_url: string | null
    user_role: string
  } | null>(null)
  const [loadingOrg, setLoadingOrg] = useState(true)

  // Fetch organization data
  useEffect(() => {
    const fetchOrganization = async () => {
      if (!user) {
        setLoadingOrg(false)
        return
      }

      try {
        const response = await fetch('/api/organizations/current')
        const result = await response.json()

        if (result.success && result.data) {
          setOrganization(result.data)
        }
      } catch (error) {
        console.error('Error fetching organization:', error)
      } finally {
        setLoadingOrg(false)
      }
    }

    fetchOrganization()
  }, [user])

  useEffect(() => {
    setShowSetupModal(setupParam === '1')
  }, [setupParam])

  const handleModalClose = useCallback(() => {
    setShowSetupModal(false)
    if (setupParam === '1') {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('setup')
      const nextPath = params.toString() ? `${pathname}?${params.toString()}` : pathname
      router.replace(nextPath, { scroll: false })
    }
  }, [pathname, router, searchParams, setupParam])

  const totalPayments = paymentData.reduce((acc, item) => acc + item.value, 0)
  const collectedPercentage = Math.round((paymentData[0].value / totalPayments) * 100)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Welcome Header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Crown className="w-8 h-8 text-[#4682B4]" />
                  <h1 className="text-3xl font-bold text-gray-900">
                    Welcome back, Manager
                  </h1>
                  {/* Organization Logo and Name Box */}
                  {organization && (
                    <div className="flex items-center gap-2.5 ml-2 px-3 py-1.5 rounded-lg bg-white border border-gray-200 shadow-sm">
                      {/* Logo Picture Box */}
                      <div className="flex items-center justify-center w-10 h-10 rounded-md overflow-hidden bg-gradient-to-br from-[#4682B4] to-[#5a9fd4] border border-gray-200 shadow-sm flex-shrink-0">
                        {organization.logo_url ? (
                          <img
                            src={organization.logo_url}
                            alt={organization.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to first letter on error
                              const parent = e.currentTarget.parentElement
                              if (parent && organization?.name) {
                                const firstLetter = organization.name.charAt(0).toUpperCase()
                                parent.className = "flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-br from-[#4682B4] to-[#5a9fd4] border border-gray-200 shadow-sm flex-shrink-0"
                                parent.innerHTML = `<span class="text-white font-bold text-base">${firstLetter}</span>`
                              }
                            }}
                          />
                        ) : (
                          <span className="text-white font-bold text-base">
                            {organization.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      {/* Organization Name */}
                      <span className="text-base font-semibold text-gray-900 whitespace-nowrap">
                        {organization.name}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-gray-600">
                  {organization?.location 
                    ? `Here's what's happening at ${organization.location} today.`
                    : "Here's what's happening with your premium properties today."}
                </p>
                {organization && (
                  <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                    {organization.email && <span>📧 {organization.email}</span>}
                    {organization.phone && <span>📞 {organization.phone}</span>}
                  </div>
                )}
              </div>
              <Link href="/dashboard/properties/new">
                <Button className="bg-[#4682B4] hover:bg-[#4682B4]/90">
                  + Add Property
                </Button>
              </Link>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Total Properties</p>
                      <p className="text-3xl font-bold">12</p>
                      <p className="text-sm text-green-600 mt-1">↑ +2 from last month</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-[#4682B4]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Active Tenants</p>
                      <p className="text-3xl font-bold">48</p>
                      <p className="text-sm text-green-600 mt-1">↑ +5 from last month</p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <Users className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Monthly Revenue</p>
                      <p className="text-3xl font-bold">KES 2.4M</p>
                      <p className="text-sm text-green-600 mt-1">↑ +12% from last month</p>
                    </div>
                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                      <DollarSign className="w-6 h-6 text-orange-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Pending Requests</p>
                      <p className="text-3xl font-bold">7</p>
                      <p className="text-sm text-green-600 mt-1">-3 from last month</p>
                    </div>
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                      <Wrench className="w-6 h-6 text-red-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-[#4682B4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <div>
                      <CardTitle className="text-xl">Revenue Trends</CardTitle>
                      <CardDescription>Monthly revenue, expenses, and profit over the last 6 months</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="#4682B4" 
                        strokeWidth={2}
                        dot={{ fill: '#4682B4', r: 4 }}
                        name="Revenue"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="expenses" 
                        stroke="#ef4444" 
                        strokeWidth={2}
                        dot={{ fill: '#ef4444', r: 4 }}
                        name="Expenses"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Property Revenue Comparison</CardTitle>
                      <CardDescription>Monthly revenue generated by each property</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={propertyRevenueData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip />
                      <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                        {propertyRevenueData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill="#4682B4" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Occupancy Rates */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Occupancy Rates</CardTitle>
                      <CardDescription>Current occupancy status by property</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { name: 'Kilimani Heights', rate: 90, occupied: 27, total: 30 },
                      { name: 'Westlands Plaza', rate: 85, occupied: 17, total: 20 },
                      { name: 'Karen Villas', rate: 75, occupied: 9, total: 12 },
                      { name: 'Eastlands Gardens', rate: 95, occupied: 23, total: 24 },
                    ].map((property) => (
                      <div key={property.name}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{property.name}</span>
                          <span className="font-bold">{property.rate}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full" 
                            style={{ width: `${property.rate}%` }}
                          />
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{property.occupied} of {property.total} units occupied</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-6 h-6 text-[#4682B4]" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Payment Status</CardTitle>
                      <CardDescription>Current payment status distribution</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center">
                    <div className="relative">
                      <ResponsiveContainer width={300} height={200}>
                        <PieChart>
                          <Pie
                            data={paymentData}
                            cx={150}
                            cy={150}
                            startAngle={180}
                            endAngle={0}
                            innerRadius={80}
                            outerRadius={120}
                            dataKey="value"
                          >
                            {paymentData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute top-24 left-1/2 transform -translate-x-1/2 text-center">
                        <p className="text-5xl font-bold text-[#4682B4]">{collectedPercentage}%</p>
                        <p className="text-sm text-gray-600">Collected</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-8 mt-4 w-full">
                      {paymentData.map((item) => (
                        <div key={item.name} className="text-center">
                          <div className="flex items-center justify-center gap-2 mb-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-sm text-gray-600">{item.name}</span>
                          </div>
                          <p className="text-2xl font-bold">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
      <OrganizationSetupModal open={showSetupModal} onClose={handleModalClose} />
    </div>
  )
}
