'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Wrench, Upload, Loader2, CheckCircle2, History } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'

const CATEGORY_OPTIONS = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'Appliance',
  'Structural',
  'Security',
  'General',
] as const

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low Priority', description: 'Non-urgent, can wait a few days', color: 'text-green-700' },
  {
    value: 'medium',
    label: 'Medium Priority',
    description: 'Should be addressed within 1-2 days',
    color: 'text-orange-700',
  },
  { value: 'high', label: 'High Priority', description: 'Urgent - affects comfort or safety', color: 'text-red-700' },
  { value: 'urgent', label: 'Emergency', description: 'Critical issue – immediate attention required', color: 'text-red-900' },
] as const

export default function NewMaintenanceRequestPage() {
  const { toast } = useToast()

  const [category, setCategory] = useState<string>('')
  const [priority, setPriority] = useState<string>('medium')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [contactPreference, setContactPreference] = useState('phone')
  const [contactTime, setContactTime] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successRequest, setSuccessRequest] = useState<{ id: string; title: string } | null>(null)

  const attachmentDetails = useMemo(
    () =>
      attachments.length > 0
        ? attachments.map((file) => `${file.name} • ${(file.size / 1024).toFixed(1)} KB`).join(', ')
        : null,
    [attachments]
  )

  useEffect(() => {
    const urls = attachments.map((file) => URL.createObjectURL(file))
    setPreviewUrls(urls)
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [attachments])

  const clearFormFields = () => {
    setCategory('')
    setPriority('medium')
    setTitle('')
    setDescription('')
    setLocation('')
    setContactPreference('phone')
    setContactTime('')
    setAttachments([])
    setPreviewUrls([])
    setError(null)
  }

  const handleSendAnother = () => {
    clearFormFields()
    setSuccessRequest(null)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    const limited = files.slice(0, 3)
    setAttachments(limited)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!title.trim() || !description.trim()) {
      setError('Please provide a title and description for the issue.')
      return
    }

    setSubmitting(true)
    try {
      let uploadedUrls: string[] = []
      if (attachments.length > 0) {
        const formData = new FormData()
        attachments.forEach((file) => formData.append('files', file))

        const uploadResponse = await fetch('/api/tenant/maintenance/attachments', {
          method: 'POST',
          body: formData,
        })

        if (!uploadResponse.ok) {
          const payload = await uploadResponse.json().catch(() => ({}))
          throw new Error(payload.error || 'Failed to upload attachments.')
        }

        const payload = await uploadResponse.json()
        uploadedUrls = payload.urls || []
      }

      const response = await fetch('/api/tenant/maintenance/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          priorityLevel: priority,
          category,
          location,
          contactPreference,
          contactTime,
          attachmentUrls: uploadedUrls,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to submit maintenance request.')
      }
      clearFormFields()
      setSuccessRequest({ id: payload.data?.id || '', title })

      toast({
        title: 'Request submitted',
        description: 'We have received your maintenance request and will respond shortly.',
      })
    } catch (err) {
      console.error('[TenantMaintenanceForm] submit failed', err)
      setError(err instanceof Error ? err.message : 'Unable to submit maintenance request.')
    } finally {
      setSubmitting(false)
    }
  }

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

        {successRequest ? (
          <Card className="text-center">
            <CardContent className="space-y-4 py-12">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <div>
                <h2 className="text-2xl font-semibold">Request submitted</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  We&apos;ve logged your maintenance request. Our team will review it and contact you shortly.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:justify-center">
                <Button onClick={handleSendAnother}>Send another request</Button>
                <Link href="/dashboard/tenant/maintenance" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full gap-2">
                    <History className="w-4 h-4" />
                    View previous requests
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle>Submit Maintenance Request</CardTitle>
            <CardDescription>
              Describe the issue you&apos;re experiencing and we&apos;ll get it fixed as soon as possible.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="category">Issue Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option.toLowerCase()}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-sm">Priority Level</Label>
                <RadioGroup value={priority} onValueChange={setPriority} className="space-y-3">
                  {PRIORITY_OPTIONS.map((option) => (
                    <div
                      key={option.value}
                      className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <RadioGroupItem value={option.value} id={option.value} />
                      <Label htmlFor={option.value} className="flex-1 cursor-pointer">
                        <p className={`font-medium text-sm ${option.color}`}>{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Issue Title</Label>
                <Input
                  id="title"
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Brief description of the issue"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Detailed Description</Label>
                <Textarea
                  id="description"
                  required
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Provide as much detail as possible, including when the issue started and any temporary fixes."
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Specific Location</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="e.g., Kitchen sink, Master bedroom, Living room"
                />
              </div>

              <div className="space-y-2">
              <Label>Photos (Optional)</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center bg-white transition-colors cursor-pointer">
                <label htmlFor="attachments" className="flex flex-col items-center gap-2 cursor-pointer">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Click here to upload up to 3 photos that show the issue clearly
                  </p>
                </label>
                <input
                  id="attachments"
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                />
                {attachmentDetails && (
                  <p className="text-xs text-muted-foreground mt-2">Attached: {attachmentDetails}</p>
                )}
              </div>
              {previewUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {previewUrls.map((src, idx) => (
                    <div key={src} className="relative rounded-lg overflow-hidden bg-slate-100">
                      <img src={src} alt={`Attachment ${idx + 1}`} className="w-full h-24 object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label>Preferred Contact Method</Label>
                <RadioGroup value={contactPreference} onValueChange={setContactPreference} className="space-y-2">
                  {['phone', 'sms', 'email'].map((method) => (
                    <div className="flex items-center space-x-2" key={method}>
                      <RadioGroupItem value={method} id={method} />
                      <Label htmlFor={method} className="cursor-pointer capitalize">
                        {method}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-time">Best Time to Contact/Visit</Label>
                <Textarea
                  id="contact-time"
                  value={contactTime}
                  onChange={(event) => setContactTime(event.target.value)}
                  placeholder="Let us know when you're typically available for us to contact you or schedule a visit."
                  rows={2}
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-900 font-medium mb-1">What happens next?</p>
                <p className="text-xs text-blue-700">
                  You will receive a confirmation notification with your request number. We typically respond within
                  24 hours.
                </p>
              </div>

              <Button className="w-full bg-orange-500 hover:bg-orange-600" size="lg" type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Maintenance Request'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  )
}
