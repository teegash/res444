'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Building2, ArrowLeft, Settings, Key, Bell, CreditCard, Users, Image, FileText, Zap, Shield, AlertTriangle } from 'lucide-react'

export default function PropertySettingsPage() {
  const router = useRouter()
  const params = useParams()
  const [activeTab, setActiveTab] = useState('general')

  const tabs = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'access', label: 'Access Control', icon: Key },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'payment', label: 'Payment Settings', icon: CreditCard },
    { id: 'tenant', label: 'Tenant Settings', icon: Users },
    { id: 'media', label: 'Photos & Media', icon: Image },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'automation', label: 'Automation', icon: Zap },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/dashboard/manager/properties/${params.id}`)}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Building2 className="w-7 h-7 text-blue-600" />
          <div>
            <div className="text-sm text-gray-500">Kilimani Heights</div>
            <h1 className="text-2xl font-bold text-gray-900">Property Settings</h1>
          </div>
        </div>
        <Button className="ml-auto bg-blue-600 hover:bg-blue-700">
          <Settings className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Sidebar */}
        <Card className="col-span-1 p-4 h-fit">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-blue-600 mb-3">Settings Menu</h3>
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </Card>

        {/* Content */}
        <div className="col-span-4 space-y-6">
          {activeTab === 'general' && (
            <Card className="p-6 bg-blue-50 border-blue-100">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">General Settings</h2>
              </div>
              <p className="text-sm text-gray-600 mb-6">Basic property information and display settings</p>

              <div className="space-y-6 bg-white p-6 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Property Display Name</Label>
                    <Input id="displayName" defaultValue="Kilimani Heights" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code">Property Code</Label>
                    <Input id="code" defaultValue="KH001" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Select defaultValue="eat">
                      <SelectTrigger id="timezone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eat">Africa/Nairobi (EAT)</SelectItem>
                        <SelectItem value="utc">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select defaultValue="kes">
                      <SelectTrigger id="currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kes">KES - Kenyan Shilling</SelectItem>
                        <SelectItem value="usd">USD - US Dollar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="desc">Property Description</Label>
                  <Textarea
                    id="desc"
                    defaultValue="Modern apartment complex with excellent amenities and prime location in Kilimani."
                    rows={3}
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">Property Status</div>
                    <div className="text-sm text-gray-500">Control property visibility and operations</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">Active</span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'access' && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Key className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">Access Control</h2>
              </div>
              <p className="text-sm text-gray-600 mb-6">Manage who can access and modify this property</p>

              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">Public Listing</div>
                      <div className="text-sm text-gray-500">Show this property in public listings</div>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">Tenant Portal Access</div>
                      <div className="text-sm text-gray-500">Allow tenants to access their portal</div>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">Manager Permissions</div>
                      <div className="text-sm text-gray-500">Allow property managers to modify settings</div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-4">Authorized Personnel</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 bg-white border rounded-lg">
                      <div>
                        <div className="font-medium text-gray-900">Jane Wanjiku</div>
                        <div className="text-sm text-gray-500">Property Manager • jane@kilimaniheights.com</div>
                      </div>
                      <Button variant="outline" size="sm">Edit</Button>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white border rounded-lg">
                      <div>
                        <div className="font-medium text-gray-900">John Doe</div>
                        <div className="text-sm text-gray-500">Assistant Manager • john@kilimaniheights.com</div>
                      </div>
                      <Button variant="outline" size="sm">Edit</Button>
                    </div>
                  </div>
                  <Button variant="outline" className="mt-3 w-full">
                    <Users className="w-4 h-4 mr-2" />
                    Add Person
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'notifications' && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">Notification Settings</h2>
              </div>
              <p className="text-sm text-gray-600 mb-6">Configure alerts and notifications for this property</p>

              <div className="space-y-6">
                <div>
                  <h3 className="font-medium text-gray-900 mb-4">Email Notifications</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'New tenant applications', sub: 'Get notified when new tenants apply' },
                      { label: 'Rent payments received', sub: 'Receive alerts for completed payments' },
                      { label: 'Maintenance requests', sub: 'Get alerts for new maintenance issues' },
                      { label: 'Lease expiration alerts', sub: 'Reminders before leases expire' },
                      { label: 'Vacancy notifications', sub: 'Alert when units become vacant' },
                    ].map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium text-gray-900">{item.label}</div>
                          <div className="text-sm text-gray-500">{item.sub}</div>
                        </div>
                        <Switch defaultChecked />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-4">SMS Notifications</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Emergency maintenance', sub: 'Urgent issues requiring immediate attention' },
                      { label: 'Late rent payments', sub: 'Alert for overdue rent' },
                      { label: 'Security alerts', sub: 'Security-related incidents' },
                      { label: 'Tenant move-in/out', sub: 'Movement notifications' },
                      { label: 'System updates', sub: 'Platform updates and news' },
                    ].map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium text-gray-900">{item.label}</div>
                          <div className="text-sm text-gray-500">{item.sub}</div>
                        </div>
                        <Switch defaultChecked={index < 3} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'payment' && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">Payment Settings</h2>
              </div>
              <p className="text-sm text-gray-600 mb-6">Configure payment methods and policies</p>

              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lateFee">Late Fee (KES)</Label>
                    <Input id="lateFee" type="number" defaultValue="2000" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gracePeriod">Grace Period (Days)</Label>
                    <Input id="gracePeriod" type="number" defaultValue="5" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deposit">Security Deposit (Months)</Label>
                    <Select defaultValue="2">
                      <SelectTrigger id="deposit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Month</SelectItem>
                        <SelectItem value="2">2 Months</SelectItem>
                        <SelectItem value="3">3 Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-4">Accepted Payment Methods</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'mpesa', label: 'M-Pesa', checked: true },
                      { id: 'bank', label: 'Bank Transfer', checked: true },
                      { id: 'cash', label: 'Cash', checked: true },
                      { id: 'cheque', label: 'Cheque', checked: true },
                    ].map((method) => (
                      <div key={method.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <Label htmlFor={method.id} className="cursor-pointer font-medium">
                          {method.label}
                        </Label>
                        <Switch id={method.id} defaultChecked={method.checked} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
