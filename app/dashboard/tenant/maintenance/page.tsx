'use client'

import { ArrowLeft, Wrench, Plus, Filter, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-purple-700">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/tenant">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Maintenance Requests</h1>
            <p className="text-sm text-white/80">Track Your Requests</p>
          </div>
          <Link href="/dashboard/tenant/maintenance/new" className="ml-auto">
            <Button className="bg-orange-500 hover:bg-orange-600 gap-2">
              <Plus className="h-4 w-4" />
              New Request
            </Button>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-white/95">
            <CardHeader className="pb-3">
              <CardDescription className="text-orange-600 font-semibold text-lg">1</CardDescription>
              <CardTitle className="text-sm">Open Requests</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-white/95">
            <CardHeader className="pb-3">
              <CardDescription className="text-blue-600 font-semibold text-lg">1</CardDescription>
              <CardTitle className="text-sm">In Progress</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-white/95">
            <CardHeader className="pb-3">
              <CardDescription className="text-green-600 font-semibold text-lg">1</CardDescription>
              <CardTitle className="text-sm">Completed This Month</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Your Maintenance Requests */}
        <Card className="bg-white/95">
          <CardHeader>
            <CardTitle>Your Maintenance Requests</CardTitle>
            <CardDescription>Track the status of your maintenance requests</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Request Cards */}
            <div className="bg-blue-50 p-6 rounded-lg border border-blue-100">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg text-blue-900">Leaking faucet in kitchen</h3>
                    <Badge className="bg-orange-500">Medium</Badge>
                    <Badge className="bg-blue-600">In Progress</Badge>
                  </div>
                  <p className="text-sm text-blue-700 mb-3">
                    The kitchen faucet has been leaking for the past few days. Water drips continuously even when turned off completely.
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-blue-600 font-medium">Category: <span className="text-blue-900">Plumbing</span></p>
                    </div>
                    <div>
                      <p className="text-blue-600 font-medium">Est. completion: <span className="text-blue-900">Dec 5, 2024</span></p>
                    </div>
                    <div>
                      <p className="text-blue-600 font-medium">Submitted: <span className="text-blue-900">Dec 2, 2024</span></p>
                    </div>
                    <div>
                      <p className="text-blue-600 font-medium">Assigned to: <span className="text-blue-900">Peter Mwangi</span></p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="bg-white">
                  View Details
                </Button>
                <Button size="sm" variant="outline" className="bg-white">
                  Add Comment
                </Button>
              </div>
            </div>

            <div className="bg-green-50 p-6 rounded-lg border border-green-100">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg text-green-900">Light bulb replacement in bedroom</h3>
                    <Badge variant="secondary">Low</Badge>
                    <Badge className="bg-green-600">Completed</Badge>
                  </div>
                  <p className="text-sm text-green-700 mb-3">
                    Main bedroom ceiling light bulb burned out and needs replacement.
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-green-600 font-medium">Category: <span className="text-green-900">Electrical</span></p>
                    </div>
                    <div>
                      <p className="text-green-600 font-medium">Completed: <span className="text-green-900">Nov 29, 2024</span></p>
                    </div>
                    <div>
                      <p className="text-green-600 font-medium">Submitted: <span className="text-green-900">Nov 28, 2024</span></p>
                    </div>
                    <div>
                      <p className="text-green-600 font-medium">Assigned to: <span className="text-green-900">James Ochieng</span></p>
                    </div>
                  </div>
                </div>
              </div>
              <Button size="sm" variant="outline" className="bg-white">
                View Details
              </Button>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg border">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">Door handle loose</h3>
                    <Badge variant="secondary">Low</Badge>
                    <Badge variant="outline">Open</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Front door handle is becoming loose and needs tightening.
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground font-medium">Category: <span className="text-foreground">General</span></p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium">Submitted: <span className="text-foreground">Nov 25, 2024</span></p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  View Details
                </Button>
                <Button size="sm" variant="outline">
                  Add Comment
                </Button>
                <Button size="sm" variant="outline">
                  Edit Request
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Need Help Section */}
        <Card className="bg-white/95">
          <CardHeader>
            <CardTitle>Need Help?</CardTitle>
            <CardDescription>Common maintenance issues and quick actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                <Plus className="h-5 w-5 text-blue-600 mb-2" />
                <p className="font-medium mb-1">Report New Issue</p>
                <p className="text-xs text-muted-foreground mb-3">Submit a new maintenance request</p>
                <Link href="/dashboard/tenant/maintenance/new">
                  <Button size="sm" variant="outline" className="w-full">
                    Create Request
                  </Button>
                </Link>
              </div>
              <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                <MessageSquare className="h-5 w-5 text-green-600 mb-2" />
                <p className="font-medium mb-1">Contact Management</p>
                <p className="text-xs text-muted-foreground mb-3">Send a message to property manager</p>
                <Link href="/dashboard/tenant/messages">
                  <Button size="sm" variant="outline" className="w-full">
                    Send Message
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
