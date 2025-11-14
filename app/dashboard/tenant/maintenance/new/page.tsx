'use client'

import { ArrowLeft, Wrench, Upload } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function NewMaintenanceRequestPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/30 via-white to-white">
      <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/tenant/maintenance">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Wrench className="h-5 w-5 text-orange-600" />
            </div>
            <h1 className="text-2xl font-bold">Report Maintenance Issue</h1>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Submit Maintenance Request</CardTitle>
            <CardDescription>Describe the issue you're experiencing and we'll get it fixed as soon as possible.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Issue Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Issue Category</Label>
              <Select>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plumbing">Plumbing</SelectItem>
                  <SelectItem value="electrical">Electrical</SelectItem>
                  <SelectItem value="hvac">HVAC</SelectItem>
                  <SelectItem value="appliance">Appliance</SelectItem>
                  <SelectItem value="structural">Structural</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Priority Level */}
            <div className="space-y-3">
              <Label>Priority Level</Label>
              <RadioGroup defaultValue="medium" className="space-y-3">
                <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="low" id="low" />
                  <Label htmlFor="low" className="flex-1 cursor-pointer">
                    <p className="font-medium text-sm text-green-700">Low Priority</p>
                    <p className="text-xs text-muted-foreground">Non-urgent, can wait a few days</p>
                  </Label>
                </div>
                <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="medium" id="medium" />
                  <Label htmlFor="medium" className="flex-1 cursor-pointer">
                    <p className="font-medium text-sm text-orange-700">Medium Priority</p>
                    <p className="text-xs text-muted-foreground">Should be addressed within 1-2 days</p>
                  </Label>
                </div>
                <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="high" id="high" />
                  <Label htmlFor="high" className="flex-1 cursor-pointer">
                    <p className="font-medium text-sm text-red-700">High Priority</p>
                    <p className="text-xs text-muted-foreground">Urgent - affects safety or habitability</p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Issue Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Issue Title</Label>
              <Input 
                id="title" 
                placeholder="Brief description of the issue" 
              />
            </div>

            {/* Detailed Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Detailed Description</Label>
              <Textarea 
                id="description" 
                placeholder="Please provide as much detail as possible about the issue, including when it started, what you've tried, and any other relevant information."
                rows={5}
              />
            </div>

            {/* Specific Location */}
            <div className="space-y-2">
              <Label htmlFor="location">Specific Location</Label>
              <Input 
                id="location" 
                placeholder="e.g., Kitchen sink, Master bedroom, Living room" 
              />
            </div>

            {/* Photos */}
            <div className="space-y-2">
              <Label>Photos (Optional)</Label>
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-accent/50 transition-colors cursor-pointer">
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-1">Upload photos to help us understand the issue better</p>
                <Button variant="outline" size="sm">Choose Files</Button>
              </div>
            </div>

            {/* Preferred Contact Method */}
            <div className="space-y-3">
              <Label>Preferred Contact Method</Label>
              <RadioGroup defaultValue="phone" className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="phone" id="phone" />
                  <Label htmlFor="phone" className="cursor-pointer">Phone Call</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sms" id="sms" />
                  <Label htmlFor="sms" className="cursor-pointer">SMS</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="email" id="email" />
                  <Label htmlFor="email" className="cursor-pointer">Email</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Best Time to Contact */}
            <div className="space-y-2">
              <Label htmlFor="contact-time">Best Time to Contact/Visit</Label>
              <Textarea 
                id="contact-time" 
                placeholder="Let us know when you're typically available for us to contact you or schedule a visit."
                rows={2}
              />
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-900 font-medium mb-1">What happens next?</p>
              <p className="text-xs text-blue-700">
                You will receive a confirmation email with your request number. We typically respond within 24 hours.
              </p>
            </div>

            <Button className="w-full bg-orange-500 hover:bg-orange-600" size="lg">
              Submit Maintenance Request
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
