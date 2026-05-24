'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import type { Conversation, Profile, Message } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  MessageCircle,
  Users,
  Radio,
  Settings,
  Shield,
  Plus,
  CircleDot,
} from 'lucide-react'

interface ChatSidebarProps {
  selectedConversation: Conversation | null
  onSelectConversation: (conversation: Conversation) => void
  onOpenNewChat: () => void
  onOpenGroups: () => void
  onOpenChannels: () => void
  onOpenCommunities: () => void
  onOpenStories: () => void
  onOpenSettings: () => void
  onOpenAdmin: () => void
}

export function ChatSidebar({
  selectedConversation,
  onSelectConversation,
  onOpenNewChat,
  onOpenGroups,
  onOpenChannels,
  onOpenCommunities,
  onOpenStories,
  onOpenSettings,
  onOpenAdmin,
}: ChatSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const { profile, isSuperAdmin } = useAuth()
  const supabase = createClient()

  const fetchConversations = useCallback(async () => {
    if (!profile) return

    const { data: participantData } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', profile.id)

    if (!participantData?.length) {
      setConversations([])
      setLoading(false)
      return
    }

    const conversationIds = participantData.map(p => p.conversation_id)

    const { data: conversationsData } = await supabase
      .from('conversations')
      .select(`
        *,
        participants:conversation_participants(
          *,
          profile:profiles(*)
        )
      `)
      .in('id', conversationIds)
      .order('created_at', { ascending: false })

    if (conversationsData) {
      // Fetch last message for each conversation
      const conversationsWithMessages = await Promise.all(
        conversationsData.map(async (conv) => {
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('*, sender:profiles(*)')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          return {
            ...conv,
            last_message: lastMsg,
          }
        })
      )
      setConversations(conversationsWithMessages)
    }
    setLoading(false)
  }, [profile, supabase])

  useEffect(() => {
    fetchConversations()

    // Subscribe to new messages for realtime updates
    const channel = supabase
      .channel('sidebar-messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        () => {
          fetchConversations()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchConversations])

  const getConversationName = (conv: Conversation) => {
    if (conv.name) return conv.name
    if (conv.type === 'direct' && conv.participants) {
      const other = conv.participants.find(p => p.user_id !== profile?.id)
      return other?.profile?.display_name || other?.profile?.email || 'Chat'
    }
    return 'Conversa'
  }

  const getConversationAvatar = (conv: Conversation) => {
    if (conv.avatar_url) return conv.avatar_url
    if (conv.type === 'direct' && conv.participants) {
      const other = conv.participants.find(p => p.user_id !== profile?.id)
      return other?.profile?.avatar_url
    }
    return null
  }

  const filteredConversations = conversations.filter(conv => {
    const name = getConversationName(conv).toLowerCase()
    return name.includes(search.toLowerCase())
  })

  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Ontem'
    } else if (days < 7) {
      return d.toLocaleDateString('pt-BR', { weekday: 'short' })
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }

  return (
    <div className="w-full md:w-96 h-full flex flex-col border-r bg-card">
      {/* Header */}
      <div className="p-4 border-b bg-primary/5">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-primary">NewMessenger</h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={onOpenStories} title="Stories">
              <CircleDot className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onOpenNewChat} title="Nova conversa">
              <Plus className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onOpenSettings} title="Configurações">
              <Settings className="w-5 h-5" />
            </Button>
            {isSuperAdmin && (
              <Button variant="ghost" size="icon" onClick={onOpenAdmin} title="Painel Admin">
                <Shield className="w-5 h-5 text-destructive" />
              </Button>
            )}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-background"
          />
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex border-b p-2 gap-1">
        <Button variant="ghost" size="sm" onClick={onOpenGroups} className="flex-1">
          <Users className="w-4 h-4 mr-1" />
          Grupos
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenChannels} className="flex-1">
          <Radio className="w-4 h-4 mr-1" />
          Canais
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenCommunities} className="flex-1">
          <MessageCircle className="w-4 h-4 mr-1" />
          Comunidades
        </Button>
      </div>

      {/* Conversations list */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 text-center text-muted-foreground">
            Carregando...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma conversa ainda</p>
            <Button variant="link" onClick={onOpenNewChat} className="mt-2">
              Iniciar nova conversa
            </Button>
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv)}
              className={cn(
                'w-full p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors text-left',
                selectedConversation?.id === conv.id && 'bg-accent'
              )}
            >
              <Avatar className="w-12 h-12">
                <AvatarImage src={getConversationAvatar(conv) || undefined} />
                <AvatarFallback className="bg-primary/20 text-primary">
                  {getConversationName(conv).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">
                    {getConversationName(conv)}
                  </span>
                  {conv.last_message && (
                    <span className="text-xs text-muted-foreground">
                      {formatTime(conv.last_message.created_at)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground truncate">
                    {conv.last_message?.is_deleted
                      ? 'Mensagem apagada'
                      : conv.last_message?.content || 'Sem mensagens'}
                  </p>
                  {conv.type !== 'direct' && (
                    <Badge variant="secondary" className="text-xs ml-1">
                      {conv.type === 'group' ? 'Grupo' : conv.type === 'channel' ? 'Canal' : 'Comunidade'}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </ScrollArea>
    </div>
  )
}
