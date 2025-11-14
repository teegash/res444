'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Send, Paperclip, Smile } from 'lucide-react'

const messages = [
  { id: 1, sender: 'Manager', senderInitials: 'MG', content: 'Hi John, just confirming you received the lease document.', date: '2024-02-01', time: '10:30 AM', isManager: true },
  { id: 2, sender: 'You', senderInitials: 'JD', content: 'Yes, I received it. Thank you!', date: '2024-02-01', time: '10:45 AM', isManager: false },
  { id: 3, sender: 'Manager', senderInitials: 'MG', content: 'Great! Let me know if you have any questions.', date: '2024-02-01', time: '11:00 AM', isManager: true },
  { id: 4, sender: 'Manager', senderInitials: 'MG', content: 'Also, please remember rent is due on the 1st of next month.', date: '2024-02-01', time: '11:05 AM', isManager: true },
  { id: 5, sender: 'You', senderInitials: 'JD', content: 'Understood, I will make the payment on time.', date: '2024-02-01', time: '2:30 PM', isManager: false },
]

export function CommunicationsTab() {
  const [newMessage, setNewMessage] = useState('')

  return (
    <div className="space-y-4 mt-6">
      <Card className="h-[600px] flex flex-col">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 bg-primary">
              <AvatarFallback className="text-primary-foreground font-semibold">MG</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">Property Manager</CardTitle>
              <CardDescription className="text-xs">Usually replies within minutes</CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.isManager ? 'justify-start' : 'justify-end'}`}
            >
              {message.isManager && (
                <Avatar className="h-8 w-8 bg-primary shrink-0">
                  <AvatarFallback className="text-primary-foreground text-xs font-semibold">
                    {message.senderInitials}
                  </AvatarFallback>
                </Avatar>
              )}
              
              <div className={`flex flex-col max-w-[70%] ${message.isManager ? 'items-start' : 'items-end'}`}>
                <div
                  className={`px-4 py-3 rounded-2xl ${
                    message.isManager
                      ? 'bg-muted text-foreground rounded-tl-sm'
                      : 'bg-primary text-primary-foreground rounded-tr-sm'
                  }`}
                >
                  <p className="text-sm leading-relaxed">{message.content}</p>
                </div>
                <span className="text-xs text-muted-foreground mt-1 px-1">
                  {message.time}
                </span>
              </div>

              {!message.isManager && (
                <Avatar className="h-8 w-8 bg-accent shrink-0">
                  <AvatarFallback className="text-accent-foreground text-xs font-semibold">
                    {message.senderInitials}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
        </CardContent>

        <div className="border-t p-4 bg-muted/20">
          <div className="flex items-end gap-2">
            <div className="flex-1 flex flex-col gap-2">
              <Textarea 
                placeholder="Type your message..." 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={2}
                className="resize-none"
              />
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  <Smile className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Button className="bg-primary hover:bg-primary/90 h-10 px-6 gap-2">
              <Send className="h-4 w-4" />
              Send
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
