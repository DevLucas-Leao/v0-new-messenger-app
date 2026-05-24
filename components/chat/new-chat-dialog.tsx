'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import type { Profile, Friendship } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Search, UserPlus, Check, X, MessageCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface NewChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStartChat: (conversationId: string) => void
}

export function NewChatDialog({ open, onOpenChange, onStartChat }: NewChatDialogProps) {
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [friends, setFriends] = useState<Profile[]>([])
  const [pendingRequests, setPendingRequests] = useState<Friendship[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const { profile } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    if (open && profile) {
      fetchFriends()
      fetchPendingRequests()
    }
  }, [open, profile])

  const fetchFriends = async () => {
    if (!profile) return
    setLoading(true)

    const { data } = await supabase
      .from('friendships')
      .select(`
        *,
        requester:profiles!friendships_requester_id_fkey(*),
        addressee:profiles!friendships_addressee_id_fkey(*)
      `)
      .eq('status', 'accepted')
      .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`)

    if (data) {
      const friendProfiles = data.map(f => 
        f.requester_id === profile.id ? f.addressee : f.requester
      ).filter(Boolean) as Profile[]
      setFriends(friendProfiles)
    }
    setLoading(false)
  }

  const fetchPendingRequests = async () => {
    if (!profile) return

    const { data } = await supabase
      .from('friendships')
      .select(`
        *,
        requester:profiles!friendships_requester_id_fkey(*)
      `)
      .eq('addressee_id', profile.id)
      .eq('status', 'pending')

    if (data) {
      setPendingRequests(data)
    }
  }

  const searchUsers = async () => {
    if (!search.trim() || !profile) return
    setSearching(true)

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', profile.id)
      .or(`email.ilike.%${search}%,display_name.ilike.%${search}%`)
      .limit(20)

    if (data) {
      setSearchResults(data)
    }
    setSearching(false)
  }

  const sendFriendRequest = async (userId: string) => {
    if (!profile) return

    const { error } = await supabase.from('friendships').insert({
      requester_id: profile.id,
      addressee_id: userId,
      status: 'pending',
    })

    if (error) {
      if (error.code === '23505') {
        toast.error('Pedido já enviado ou vocês já são amigos')
      } else {
        toast.error('Erro ao enviar pedido')
      }
    } else {
      toast.success('Pedido de amizade enviado!')
      searchUsers()
    }
  }

  const respondToRequest = async (friendshipId: string, accept: boolean) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: accept ? 'accepted' : 'rejected' })
      .eq('id', friendshipId)

    if (error) {
      toast.error('Erro ao processar pedido')
    } else {
      toast.success(accept ? 'Pedido aceito!' : 'Pedido recusado')
      fetchPendingRequests()
      if (accept) fetchFriends()
    }
  }

  const startDirectChat = async (friendId: string) => {
    if (!profile) return

    // Check if conversation already exists
    const { data: existingParticipants } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', profile.id)

    if (existingParticipants) {
      for (const p of existingParticipants) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('*, participants:conversation_participants(user_id)')
          .eq('id', p.conversation_id)
          .eq('type', 'direct')
          .single()

        if (conv && conv.participants?.length === 2) {
          const hasOther = conv.participants.some((cp: { user_id: string }) => cp.user_id === friendId)
          if (hasOther) {
            onStartChat(conv.id)
            onOpenChange(false)
            return
          }
        }
      }
    }

    // Create new conversation
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({
        type: 'direct',
        created_by: profile.id,
      })
      .select()
      .single()

    if (convError || !newConv) {
      toast.error('Erro ao criar conversa')
      return
    }

    // Add participants
    await supabase.from('conversation_participants').insert([
      { conversation_id: newConv.id, user_id: profile.id, role: 'member' },
      { conversation_id: newConv.id, user_id: friendId, role: 'member' },
    ])

    onStartChat(newConv.id)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por email ou nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                className="pl-10"
              />
            </div>
            <Button onClick={searchUsers} disabled={searching}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
            </Button>
          </div>

          {/* Pending requests */}
          {pendingRequests.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Pedidos pendentes</h4>
              <div className="space-y-2">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="flex items-center gap-3 p-2 rounded-lg bg-accent/50">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={request.requester?.avatar_url || undefined} />
                      <AvatarFallback>
                        {request.requester?.display_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {request.requester?.display_name || request.requester?.email}
                      </p>
                      <p className="text-xs text-muted-foreground">{request.requester?.email}</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => respondToRequest(request.id, true)}>
                      <Check className="w-4 h-4 text-green-500" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => respondToRequest(request.id, false)}>
                      <X className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search results */}
          {searchResults.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Resultados da busca</h4>
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {searchResults.map((user) => {
                    const isFriend = friends.some(f => f.id === user.id)
                    return (
                      <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback>
                            {user.display_name?.charAt(0) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{user.display_name || user.email}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                        {isFriend ? (
                          <Button size="sm" onClick={() => startDirectChat(user.id)}>
                            <MessageCircle className="w-4 h-4 mr-1" />
                            Conversar
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => sendFriendRequest(user.id)}>
                            <UserPlus className="w-4 h-4 mr-1" />
                            Adicionar
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Friends list */}
          <div>
            <h4 className="text-sm font-medium mb-2">Seus amigos</h4>
            <ScrollArea className="h-48">
              {loading ? (
                <div className="text-center py-4 text-muted-foreground">Carregando...</div>
              ) : friends.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <p>Você ainda não tem amigos</p>
                  <p className="text-xs">Busque por email para adicionar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {friends.map((friend) => (
                    <button
                      key={friend.id}
                      onClick={() => startDirectChat(friend.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 text-left"
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback>
                          {friend.display_name?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{friend.display_name || friend.email}</p>
                        <p className="text-xs text-muted-foreground">{friend.email}</p>
                      </div>
                      <MessageCircle className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
