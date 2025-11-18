'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const initialRender = useRef(true)

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
      const filteredMessages = (payload.data || []).filter(
        (msg: CommunicationMessage) => msg.related_entity_type !== 'payment'
      )
      initialRender.current = true
      setMessages(filteredMessages)

      const unreadForTenant = filteredMessages
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
    if (loading) return
    const behavior: ScrollBehavior = initialRender.current ? 'auto' : 'smooth'
    bottomRef.current?.scrollIntoView({ behavior })
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
          if (record.related_entity_type === 'payment') return
          setMessages((existing) => [...existing, record])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, user?.id])

  const handleSendMessage = async () => {
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
      setMessages((existing) => [...existing, payload.data])
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

  const formattedMessages = messages.map((message) => ({
    ...message,
    isTenant: message.sender_user_id === user?.id,
    timestamp: message.created_at
      ? format(new Date(message.created_at), 'MMM d, yyyy • h:mm a')
      : '',
  }))

  return (
    <div className="space-y-4 mt-6">
      <Card className="h-[600px] flex flex-col">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 bg-primary">
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

        <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
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
                      message.isTenant
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-muted text-foreground rounded-tl-sm'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-line">
                      {message.message_text}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground mt-1 px-1">{message.timestamp}</span>
                </div>

                {message.isTenant && (
                  <Avatar className="h-8 w-8 bg-accent shrink-0">
                    <AvatarFallback className="text-accent-foreground text-xs font-semibold">
                      {user?.email?.[0]?.toUpperCase() || 'Y'}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </CardContent>

        <div className="border-t p-4 bg-muted/20">
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
