'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Search, Eye, MessageSquare, UserPlus, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'

const maintenanceRequests = [
  {
    id: 1,
    title: 'Leaking faucet in kitchen',
    tenant: 'John Kamau',
    property: 'Kilimani Heights',
    unit: 'Unit A-101',
    category: 'Plumbing',
    priority: 'Medium',
    status: 'In Progress',
    submitted: 'Dec 2, 2024',
    assignedTo: 'Peter Mwangi'
  },
  {
    id: 2,
    title: 'Electrical outlet not working',
    tenant: 'Sarah Muthoni',
    property: 'Westlands Plaza',
    unit: 'Unit B-102',
    category: 'Electrical',
    priority: 'High',
    status: 'Open',
    submitted: 'Dec 1, 2024',
    assignedTo: 'Unassigned'
  },
  {
    id: 3,
    title: 'Door lock needs repair',
    tenant: 'David Kiprop',
    property: 'Karen Villas',
    unit: 'Unit C-205',
    category: 'Security',
    priority: 'Low',
    status: 'Completed',
    submitted: 'Nov 30, 2024',
    assignedTo: 'James Ochieng'
  },
  {
    id: 4,
    title: 'Air conditioning not cooling',
    tenant: 'Grace Akinyi',
    property: 'Kilimani Heights',
    unit: 'Unit A-203',
    category: 'HVAC',
    priority: 'High',
    status: 'Open',
    submitted: 'Dec 3, 2024',
    assignedTo: 'Unassigned'
  }
]

export default function MaintenancePage() {
  const [selectedRequest, setSelectedRequest] = useState<typeof maintenanceRequests[0] | null>(null)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)

  const openRequests = maintenanceRequests.filter(r => r.status === 'Open').length
  const inProgress = maintenanceRequests.filter(r => r.status === 'In Progress').length
  const completedToday = maintenanceRequests.filter(r => r.status === 'Completed').length

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 overflow-auto bg-gradient-to-b from-blue-50/50 via-white to-white">
          <div className="bg-gradient-to-r from-[#4682B4] to-[#5B9BD5] text-white p-6 mb-6">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center gap-3 mb-2">
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className="text-white hover:bg-white/20">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/20 rounded-lg">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Maintenance Requests</h1>
                  <p className="text-sm text-white/90">Premium Property Management</p>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 space-y-6 pb-10">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-l-4 border-l-yellow-500">
                <CardContent className="p-6">
                  <p className="text-sm text-gray-600 mb-1">Open Requests</p>
                  <p className="text-3xl font-bold">{openRequests}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-6">
                  <p className="text-sm text-gray-600 mb-1">In Progress</p>
                  <p className="text-3xl font-bold">{inProgress}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-6">
                  <p className="text-sm text-gray-600 mb-1">Completed Today</p>
                  <p className="text-3xl font-bold">{completedToday}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="p-6">
                  <p className="text-sm text-gray-600 mb-1">Average Response</p>
                  <p className="text-3xl font-bold">2.5 hrs</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-bold mb-4">Filter Requests</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input placeholder="Search requests..." className="pl-10" />
                  </div>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="plumbing">Plumbing</SelectItem>
                      <SelectItem value="electrical">Electrical</SelectItem>
                      <SelectItem value="hvac">HVAC</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <div>
              <h2 className="text-xl font-bold mb-2">Maintenance Requests</h2>
              <p className="text-sm text-gray-600 mb-4">All maintenance requests from tenants</p>
              
              <div className="space-y-3">
                {maintenanceRequests.map((request) => (
                  <Card key={request.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-3">
                            <h3 className="font-bold text-lg">{request.title}</h3>
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant="secondary" 
                                className={
                                  request.priority === 'High' ? 'bg-red-100 text-red-700' :
                                  request.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-gray-100 text-gray-700'
                                }
                              >
                                {request.priority}
                              </Badge>
                              <Badge 
                                variant="secondary"
                                className={
                                  request.status === 'Open' ? 'bg-blue-100 text-blue-700' :
                                  request.status === 'In Progress' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-green-100 text-green-700'
                                }
                              >
                                {request.status}
                              </Badge>
                            </div>
                          </div>
                          
                          <p className="text-sm text-gray-600 mb-3">
                            {request.tenant} • {request.property} • {request.unit}
                          </p>
                          
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Category: </span>
                              <span className="font-medium">{request.category}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Submitted: </span>
                              <span className="font-medium">{request.submitted}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Assigned to: </span>
                              <span className="font-medium">{request.assignedTo}</span>
                            </div>
                          </div>
                          
                          <div className="flex gap-2 mt-4">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setSelectedRequest(request)
                                setDetailsModalOpen(true)
                              }}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              View Details
                            </Button>
                            <Button variant="outline" size="sm">
                              <MessageSquare className="w-4 h-4 mr-1" />
                              Contact Tenant
                            </Button>
                            {request.assignedTo === 'Unassigned' && (
                              <Button 
                                size="sm" 
                                className="bg-yellow-600 hover:bg-yellow-700"
                                onClick={() => {
                                  setSelectedRequest(request)
                                  setAssignModalOpen(true)
                                }}
                              >
                                <UserPlus className="w-4 h-4 mr-1" />
                                Assign Technician
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </main>

        <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>Complete information about the maintenance request</DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Title</Label>
                <p className="text-lg font-bold">{selectedRequest.title}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Tenant</Label>
                  <p>{selectedRequest.tenant}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Property</Label>
                  <p>{selectedRequest.property}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Unit</Label>
                  <p>{selectedRequest.unit}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Category</Label>
                  <p>{selectedRequest.category}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Priority</Label>
                  <Badge variant="secondary">{selectedRequest.priority}</Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <Badge variant="secondary">{selectedRequest.status}</Badge>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Description</Label>
                <p className="text-sm text-gray-600 mt-1">
                  The {selectedRequest.category.toLowerCase()} system requires immediate attention. 
                  Tenant has reported issues and requests prompt resolution.
                </p>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1">Mark as Complete</Button>
                <Button variant="outline" className="flex-1">Add Note</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Technician</DialogTitle>
            <DialogDescription>Select a technician for this maintenance request</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Technician</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select technician..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="peter">Peter Mwangi - Plumber</SelectItem>
                  <SelectItem value="james">James Ochieng - Electrician</SelectItem>
                  <SelectItem value="mary">Mary Wanjiru - General Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (Optional)</Label>
              <Textarea placeholder="Add any special instructions..." />
            </div>
            <Button className="w-full">Assign Request</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  </div>
)
}
