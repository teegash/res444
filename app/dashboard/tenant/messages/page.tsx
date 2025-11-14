'use client'

import { ArrowLeft, MessageSquare, Phone, Mail } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CommunicationsTab } from '@/components/dashboard/tenant/communications-tab'

export default function MessagesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/30 via-white to-white">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/tenant">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <MessageSquare className="h-5 w-5 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold">Messages</h1>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CommunicationsTab />
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Contact</CardTitle>
                <CardDescription className="text-xs">Need immediate assistance?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <Phone className="h-4 w-4 text-green-600" />
                    <p className="font-medium text-sm">Emergency Contact</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">For urgent issues after hours</p>
                  <Button variant="outline" size="sm" className="w-full">
                    Call: +254 712 345 678
                  </Button>
                </div>

                <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <MessageSquare className="h-4 w-4 text-blue-600" />
                    <p className="font-medium text-sm">Property Manager</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">Jane Wanjiku</p>
                  <Button variant="outline" size="sm" className="w-full mb-2">
                    Call: +254 712 345 679
                  </Button>
                </div>

                <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <Phone className="h-4 w-4 text-orange-600" />
                    <p className="font-medium text-sm">Maintenance Team</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">For maintenance requests</p>
                  <Button variant="outline" size="sm" className="w-full">
                    Call: +254 712 345 680
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
