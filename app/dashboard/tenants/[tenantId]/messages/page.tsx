'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ArrowLeft, Send, Loader2, MessageSquare, Phone } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/context'

interface ConversationMessage {
  id: string
  sender_user_id: string
  recipient_user_id: string | null
  message_text: string
  created_at: string
}

interface TenantInfo {
  id: string
  full_name: string | null
  profile_picture_url: string | null
  email: string | null
  phone_number: string | null
  unit_label: string | null
}

export default function ManagerTenantMessagesPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const tenantIdParam = params?.tenantId
  const tenantIdQuery = searchParams?.get('tenantId')
  const tenantIdValue = Array.isArray(tenantIdParam) ? tenantIdParam[0] : tenantIdParam
  const tenantId = tenantIdValue || tenantIdQuery || ''
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { user } = useAuth()
  const { toast } = useToast()

  const [tenant, setTenant] = useState<TenantInfo | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const initialRender = useRef(true)

  const fetchConversation = async () => {
    if (!tenantId) return
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/tenants/${tenantId}/messages?tenantId=${tenantId}`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to load conversation.')
      }
      const payload = await response.json()
      initialRender.current = true
      setTenant(payload.data?.tenant || null)
      setMessages(payload.data?.messages || [])
    } catch (err) {
      console.error('[ManagerTenantMessages] load failed', err)
      setError(err instanceof Error ? err.message : 'Unable to load conversation.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConversation()
  }, [tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    initialRender.current = true
  }, [tenantId])

  useEffect(() => {
    if (loading) return
    const behavior: ScrollBehavior = initialRender.current ? 'auto' : 'smooth'
    bottomRef.current?.scrollIntoView({ behavior })
    initialRender.current = false
  }, [messages, loading])

  useEffect(() => {
    if (!tenantId || !user?.id) return
    const tenantChannel = supabase
      .channel(`tenant-chat-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'communications',
          filter: `sender_user_id=eq.${tenantId}`,
        },
        async (payload) => {
          if (payload.new.recipient_user_id === user.id) {
            setMessages((current) => [...current, payload.new as ConversationMessage])
            await fetch('/api/manager/notifications', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: [payload.new.id] }),
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(tenantChannel)
    }
  }, [supabase, tenantId, user?.id])

  const handleSend = async () => {
    if (sending) return
    if (!tenantId || !newMessage.trim()) {
      toast({
        title: 'Message required',
        description: 'Please enter a message before sending.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSending(true)
      const response = await fetch(`/api/tenants/${tenantId}/message?tenantId=${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newMessage.trim() }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to send message.')
      }

      const payload = await response.json()
      if (payload.data) {
        setMessages((current) => [...current, payload.data])
      } else {
        fetchConversation()
      }
      setNewMessage('')
    } catch (err) {
      toast({
        title: 'Unable to send message',
        description: err instanceof Error ? err.message : 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  if (!tenantId) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to messages"
            onClick={() => router.push('/dashboard/communications?tab=messages')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="mt-6 text-sm text-muted-foreground">
            Tenant information was not provided. Please return to the tenant list and open the chat again.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/30 via-white to-white">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back to messages"
              onClick={() => router.push('/dashboard/communications?tab=messages')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <h1 className="text-2xl font-bold">Messages</h1>
            </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="h-[600px] flex flex-col border border-slate-200 overflow-hidden">
              <CardHeader className="border-b bg-white">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 border border-slate-200">
                    {tenant?.profile_picture_url ? (
                      <img src={tenant.profile_picture_url} alt={tenant.full_name || ''} />
                    ) : (
                      <AvatarFallback>
                        {(tenant?.full_name || 'TN')
                          .split(' ')
                          .map((chunk) => chunk[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="flex flex-col">
                    <p className="font-semibold text-lg">{tenant?.full_name || 'Tenant'}</p>
                    <p className="text-xs text-muted-foreground">
                      {tenant?.unit_label || tenant?.email || tenant?.phone_number || ''}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 flex flex-col p-0">
                <div className="flex-1 min-h-0 overflow-y-auto space-y-4 p-6 bg-slate-50/60">
                  {loading ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading conversation…
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground">
                      No messages yet. Start the conversation below.
                    </p>
                  ) : (
                    messages.map((message) => {
                      const isManager = message.sender_user_id === user?.id
                      const isNotice = (message.message_text || '').startsWith('[NOTICE]')
                      return (
                        <div key={message.id} className={`flex ${isManager ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                              isNotice
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : isManager
                                  ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                  : 'bg-white text-foreground rounded-tl-sm border border-slate-200'
                            }`}
                          >
                            <p className="whitespace-pre-line">
                              {message.message_text.replace(/^\[NOTICE\]\s*/, '')}
                            </p>
                            <span
                              className={`block text-[10px] mt-1 ${
                                isManager ? 'text-white/80' : 'text-muted-foreground'
                              }`}
                            >
                              {new Date(message.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={bottomRef} />
                </div>
                <div className="border-t p-4 bg-white">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={newMessage}
                      onChange={(event) => setNewMessage(event.target.value)}
                      placeholder="Type your message..."
                      rows={2}
                      className="flex-1 resize-none bg-slate-50"
                    />
                    <Button
                      className="bg-primary hover:bg-primary/90 h-11 px-6 gap-2 rounded-xl"
                      onClick={handleSend}
                      disabled={sending}
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
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
                  <p className="text-xs text-muted-foreground mb-2">{tenant?.full_name || 'Tenant contact'}</p>
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
