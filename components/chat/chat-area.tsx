'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import type { Conversation, Message, Profile } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ArrowLeft,
  Send,
  MoreVertical,
  Phone,
  Video,
  Smile,
  Paperclip,
  Check,
  CheckCheck,
  Trash2,
  Copy,
  Reply,
} from 'lucide-react'
import { toast } from 'sonner'

interface ChatAreaProps {
  conversation: Conversation
  onBack: () => void
  onOpenInfo: () => void
}

export function ChatArea({ conversation, onBack, onOpenInfo }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { profile, isSuperAdmin } = useAuth()
  const supabase = createClient()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, sender:profiles(*)')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })

    if (data) {
      setMessages(data)
      scrollToBottom()
    }
    setLoading(false)
  }, [conversation.id, supabase])

  useEffect(() => {
    fetchMessages()

    // Subscribe to new messages
    const channel = supabase
      .channel(`messages-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch the complete message with sender info
            supabase
              .from('messages')
              .select('*, sender:profiles(*)')
              .eq('id', payload.new.id)
              .single()
              .then(({ data }) => {
                if (data) {
                  setMessages(prev => [...prev, data])
                  scrollToBottom()
                }
              })
          } else if (payload.eventType === 'UPDATE') {
            setMessages(prev =>
              prev.map(m => (m.id === payload.new.id ? { ...m, ...payload.new } : m))
            )
          } else if (payload.eventType === 'DELETE') {
            setMessages(prev => prev.filter(m => m.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversation.id, supabase, fetchMessages])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !profile) return

    setSending(true)
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender_id: profile.id,
      content: newMessage.trim(),
      type: 'text',
    })

    if (error) {
      toast.error('Erro ao enviar mensagem')
    } else {
      setNewMessage('')
    }
    setSending(false)
  }

  const deleteMessage = async (messageId: string) => {
    const { error } = await supabase
      .from('messages')
      .update({ is_deleted: true, content: null })
      .eq('id', messageId)

    if (error) {
      toast.error('Erro ao apagar mensagem')
    }
  }

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
    toast.success('Mensagem copiada!')
  }

  const getConversationName = () => {
    if (conversation.name) return conversation.name
    if (conversation.type === 'direct' && conversation.participants) {
      const other = conversation.participants.find(p => p.user_id !== profile?.id)
      return other?.profile?.display_name || other?.profile?.email || 'Chat'
    }
    return 'Conversa'
  }

  const getConversationAvatar = () => {
    if (conversation.avatar_url) return conversation.avatar_url
    if (conversation.type === 'direct' && conversation.participants) {
      const other = conversation.participants.find(p => p.user_id !== profile?.id)
      return other?.profile?.avatar_url
    }
    return null
  }

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (d.toDateString() === today.toDateString()) {
      return 'Hoje'
    } else if (d.toDateString() === yesterday.toDateString()) {
      return 'Ontem'
    }
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }

  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = []
    let currentDate = ''

    messages.forEach(message => {
      const messageDate = new Date(message.created_at).toDateString()
      if (messageDate !== currentDate) {
        currentDate = messageDate
        groups.push({ date: message.created_at, messages: [message] })
      } else {
        groups[groups.length - 1].messages.push(message)
      }
    })

    return groups
  }

  const messageGroups = groupMessagesByDate(messages)

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b bg-card flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <button onClick={onOpenInfo} className="flex items-center gap-3 flex-1">
          <Avatar className="w-10 h-10">
            <AvatarImage src={getConversationAvatar() || undefined} />
            <AvatarFallback className="bg-primary/20 text-primary">
              {getConversationName().charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="text-left">
            <h2 className="font-semibold">{getConversationName()}</h2>
            {conversation.type !== 'direct' && conversation.participants && (
              <p className="text-xs text-muted-foreground">
                {conversation.participants.length} participantes
              </p>
            )}
          </div>
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon">
            <Video className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Phone className="w-5 h-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpenInfo}>
                Info do {conversation.type === 'direct' ? 'contato' : 'grupo'}
              </DropdownMenuItem>
              <DropdownMenuItem>Buscar mensagens</DropdownMenuItem>
              <DropdownMenuItem>Arquivar conversa</DropdownMenuItem>
              {isSuperAdmin && (
                <DropdownMenuItem className="text-destructive">
                  Apagar todas as mensagens
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 chat-bg">
        <div className="p-4 space-y-2">
          {loading ? (
            <div className="text-center text-muted-foreground py-8">
              Carregando mensagens...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p>Nenhuma mensagem ainda</p>
              <p className="text-sm">Envie a primeira mensagem!</p>
            </div>
          ) : (
            messageGroups.map((group, groupIndex) => (
              <div key={groupIndex}>
                <div className="flex justify-center my-4">
                  <span className="bg-card px-3 py-1 rounded-full text-xs text-muted-foreground shadow-sm">
                    {formatDate(group.date)}
                  </span>
                </div>
                {group.messages.map((message) => {
                  const isOwn = message.sender_id === profile?.id
                  const canDelete = isOwn || isSuperAdmin

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        'flex mb-1',
                        isOwn ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <div
                            className={cn(
                              'max-w-[75%] px-3 py-2 shadow-sm cursor-pointer hover:shadow-md transition-shadow',
                              isOwn ? 'message-bubble-out' : 'message-bubble-in'
                            )}
                          >
                            {!isOwn && conversation.type !== 'direct' && (
                              <p className="text-xs font-medium text-primary mb-1">
                                {message.sender?.display_name || message.sender?.email}
                              </p>
                            )}
                            {message.is_deleted ? (
                              <p className="italic text-muted-foreground text-sm">
                                Mensagem apagada
                              </p>
                            ) : (
                              <p className="text-sm whitespace-pre-wrap break-words">
                                {message.content}
                              </p>
                            )}
                            <div className={cn(
                              'flex items-center gap-1 mt-1',
                              isOwn ? 'justify-end' : 'justify-start'
                            )}>
                              <span className="text-[10px] text-muted-foreground">
                                {formatTime(message.created_at)}
                              </span>
                              {isOwn && (
                                <CheckCheck className="w-3 h-3 text-primary" />
                              )}
                            </div>
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {!message.is_deleted && (
                            <DropdownMenuItem onClick={() => copyMessage(message.content || '')}>
                              <Copy className="w-4 h-4 mr-2" />
                              Copiar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem>
                            <Reply className="w-4 h-4 mr-2" />
                            Responder
                          </DropdownMenuItem>
                          {canDelete && !message.is_deleted && (
                            <DropdownMenuItem
                              onClick={() => deleteMessage(message.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Apagar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                })}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Message input */}
      <form onSubmit={sendMessage} className="p-3 border-t bg-card flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon">
          <Smile className="w-5 h-5" />
        </Button>
        <Button type="button" variant="ghost" size="icon">
          <Paperclip className="w-5 h-5" />
        </Button>
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Digite uma mensagem..."
          className="flex-1"
          disabled={sending}
        />
        <Button type="submit" size="icon" disabled={!newMessage.trim() || sending}>
          <Send className="w-5 h-5" />
        </Button>
      </form>
    </div>
  )
}
