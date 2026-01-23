'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Send, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/lib/auth/context'
import { createClient } from '@/lib/supabase/client'

interface CommunicationMessage {
  id: string
  sender_user_id: string
  recipient_user_id: string | null
  message_text: string
  read: boolean
  created_at: string
  sender_name?: string
  sender_avatar_url?: string | null
  related_entity_type?: string | null
}

export function CommunicationsTab() {
  const { user } = useAuth()
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const [newMessage, setNewMessage] = useState('')
  const [messages, setMessages] = useState<CommunicationMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const initialRender = useRef(true)
  const tenantAvatarRef = useRef<string | null>(null)
  const orgAvatarRef = useRef<string | null>(null)

  const fetchMessages = useCallback(async () => {
    if (!user?.id) return
    try {
      setLoading(true)
      const response = await fetch('/api/tenant/messages', { cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to load messages.')
      }
      const payload = await response.json()
      initialRender.current = true
      setMessages(payload.data || [])

      const rows = Array.isArray(payload.data) ? payload.data : []
      tenantAvatarRef.current =
        rows.find((msg: CommunicationMessage) => msg.sender_user_id === user.id && msg.sender_avatar_url)?.sender_avatar_url ||
        tenantAvatarRef.current
      orgAvatarRef.current =
        rows.find((msg: CommunicationMessage) => msg.sender_user_id !== user.id && msg.sender_avatar_url)?.sender_avatar_url ||
        orgAvatarRef.current

      const unreadForTenant = (payload.data || [])
        .filter((msg: CommunicationMessage) => !msg.read && msg.recipient_user_id === user.id)
        .map((msg: CommunicationMessage) => msg.id)

      if (unreadForTenant.length > 0) {
        await fetch('/api/tenant/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: unreadForTenant }),
        })
      }
    } catch (error) {
      console.error('[CommunicationsTab] load failed', error)
      toast({
        title: 'Unable to load messages',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast, user?.id])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        const response = await fetch('/api/organizations/current', { cache: 'no-store' })
        if (!response.ok) return
        const payload = await response.json().catch(() => ({}))
        const logoUrl = payload?.data?.logo_url || null
        setOrgLogoUrl(logoUrl)
        if (logoUrl) {
          orgAvatarRef.current = logoUrl
        }
      } catch {
        // ignore logo lookup
      }
    }
    fetchOrganization()
  }, [])

  useEffect(() => {
    if (loading) return
    const container = scrollAreaRef.current
    if (!container) return
    const behavior: ScrollBehavior = initialRender.current ? 'auto' : 'smooth'
    container.scrollTo({ top: container.scrollHeight, behavior })
    initialRender.current = false
  }, [messages, loading])

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`tenant-communications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'communications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        (payload) => {
          const record = payload.new as CommunicationMessage
          const isTenant = record.sender_user_id === user.id
          const enrichedRecord: CommunicationMessage = {
            ...record,
            sender_avatar_url: record.sender_avatar_url || (isTenant ? tenantAvatarRef.current : orgAvatarRef.current),
          }
          setMessages((existing) => [...existing, enrichedRecord])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, user?.id])

  const handleSendMessage = async () => {
    if (sending) return
    if (!newMessage.trim()) {
      toast({
        title: 'Message required',
        description: 'Please enter a message before sending.',
        variant: 'destructive',
      })
      return
    }
    try {
      setSending(true)
      const response = await fetch('/api/tenant/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newMessage.trim() }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to send message.')
      }

      const payload = await response.json()
      const newEntry = Array.isArray(payload.data) ? payload.data[0] : payload.data
      if (newEntry) {
        setMessages((existing) => [...existing, newEntry])
      }
      setNewMessage('')
      toast({
        title: 'Message sent',
        description: 'We will get back to you shortly.',
      })
    } catch (error) {
      toast({
        title: 'Unable to send message',
        description: error instanceof Error ? error.message : 'Please try again in a few minutes.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  const orderedMessages = [...messages].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return aTime - bTime
  })

  const formattedMessages = orderedMessages.map((message) => {
    const text = message.message_text || ''
    return {
      ...message,
      message_text: text,
      isTenant: message.sender_user_id === user?.id,
      isNotice: text.startsWith('[NOTICE]'),
      timestamp: message.created_at ? format(new Date(message.created_at), 'MMM d, yyyy • h:mm a') : '',
    }
  })

  return (
    <div className="space-y-4 mt-3 md:mt-6">
      <Card className="h-[calc(100svh-120px)] md:h-[600px] flex flex-col">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 bg-primary">
              {orgLogoUrl ? (
                <AvatarImage src={orgLogoUrl} alt="Organization logo" />
              ) : null}
              <AvatarFallback className="text-primary-foreground font-semibold">
                {user?.email?.[0]?.toUpperCase() || 'Y'}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">Property Messaging</CardTitle>
              <CardDescription className="text-xs">
                Communicate with your property manager in real time
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent ref={scrollAreaRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading conversation…
            </div>
          ) : formattedMessages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              No messages yet. Start a conversation with your property team.
            </p>
          ) : (
            formattedMessages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.isTenant ? 'justify-end' : 'justify-start'}`}
              >
                {!message.isTenant && (
                  <Avatar className="h-8 w-8 bg-primary shrink-0">
                    {message.sender_avatar_url || orgLogoUrl ? (
                      <AvatarImage
                        src={message.sender_avatar_url || orgLogoUrl || undefined}
                        alt={message.sender_name || 'Organization'}
                      />
                    ) : null}
                    <AvatarFallback className="text-primary-foreground text-xs font-semibold">
                      {(message.sender_name || 'PM')
                        .split(' ')
                        .map((chunk) => chunk[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div
                  className={`flex flex-col max-w-[70%] ${
                    message.isTenant ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`px-4 py-3 rounded-2xl ${
                      message.isNotice
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : message.isTenant
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : 'bg-muted text-foreground rounded-tl-sm'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-line">
                      {message.message_text ? message.message_text.replace(/^\[NOTICE\]\s*/, '') : ''}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground mt-1 px-1">{message.timestamp}</span>
                </div>

                {message.isTenant && (
                  <Avatar className="h-8 w-8 bg-accent shrink-0">
                    {message.sender_avatar_url ? (
                      <AvatarImage src={message.sender_avatar_url} alt={user?.email || 'Tenant'} />
                    ) : null}
                    <AvatarFallback className="text-accent-foreground text-xs font-semibold">
                      {user?.email?.[0]?.toUpperCase() || 'Y'}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))
          )}
        </CardContent>

        <div className="border-t p-4 bg-muted/20 sticky bottom-0">
          <div className="flex items-end gap-2">
            <Textarea
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              rows={2}
              className="resize-none"
            />
            <Button
              className="bg-primary hover:bg-primary/90 h-10 px-6 gap-2"
              onClick={handleSendMessage}
              disabled={sending}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
