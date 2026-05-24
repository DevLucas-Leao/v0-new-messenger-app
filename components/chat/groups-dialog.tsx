'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import type { Profile, Conversation } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Users, Radio, MessageCircle, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface GroupsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: 'group' | 'channel' | 'community'
  onSelectConversation: (conversation: Conversation) => void
}

export function GroupsDialog({ open, onOpenChange, type, onSelectConversation }: GroupsDialogProps) {
  const [tab, setTab] = useState<'list' | 'create'>('list')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [friends, setFriends] = useState<Profile[]>([])
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const { profile, isSuperAdmin } = useAuth()
  const supabase = createClient()

  const typeLabel = type === 'group' ? 'Grupo' : type === 'channel' ? 'Canal' : 'Comunidade'
  const typeLabelPlural = type === 'group' ? 'Grupos' : type === 'channel' ? 'Canais' : 'Comunidades'

  useEffect(() => {
    if (open) {
      fetchConversations()
      fetchFriends()
    }
  }, [open, type])

  const fetchConversations = async () => {
    if (!profile) return
    setLoading(true)

    let query = supabase
      .from('conversations')
      .select(`
        *,
        participants:conversation_participants(
          *,
          profile:profiles(*)
        )
      `)
      .eq('type', type)

    // Super admin can see all
    if (!isSuperAdmin) {
      const { data: myParticipations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', profile.id)

      if (myParticipations?.length) {
        const ids = myParticipations.map(p => p.conversation_id)
        query = query.in('id', ids)
      } else {
        setConversations([])
        setLoading(false)
        return
      }
    }

    const { data } = await query.order('created_at', { ascending: false })

    if (data) {
      setConversations(data)
    }
    setLoading(false)
  }

  const fetchFriends = async () => {
    if (!profile) return

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
  }

  const createConversation = async () => {
    if (!profile || !name.trim()) return
    setCreating(true)

    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({
        type,
        name: name.trim(),
        description: description.trim() || null,
        created_by: profile.id,
      })
      .select()
      .single()

    if (convError || !newConv) {
      toast.error(`Erro ao criar ${typeLabel.toLowerCase()}`)
      setCreating(false)
      return
    }

    // Add creator as owner
    const participants = [
      { conversation_id: newConv.id, user_id: profile.id, role: 'owner' },
      ...selectedFriends.map(id => ({
        conversation_id: newConv.id,
        user_id: id,
        role: 'member',
      })),
    ]

    await supabase.from('conversation_participants').insert(participants)

    toast.success(`${typeLabel} criado com sucesso!`)
    setName('')
    setDescription('')
    setSelectedFriends([])
    setTab('list')
    fetchConversations()
    setCreating(false)
  }

  const joinConversation = async (conv: Conversation) => {
    if (!profile) return

    const isParticipant = conv.participants?.some(p => p.user_id === profile.id)
    
    if (!isParticipant) {
      // Super admin joins as owner
      const role = isSuperAdmin ? 'owner' : 'member'
      
      await supabase.from('conversation_participants').insert({
        conversation_id: conv.id,
        user_id: profile.id,
        role,
      })

      // If super admin, update existing owner to admin
      if (isSuperAdmin) {
        const currentOwner = conv.participants?.find(p => p.role === 'owner')
        if (currentOwner && currentOwner.user_id !== profile.id) {
          await supabase
            .from('conversation_participants')
            .update({ role: 'admin' })
            .eq('id', currentOwner.id)
        }
      }

      toast.success(`Você entrou no ${typeLabel.toLowerCase()}!`)
    }

    onSelectConversation(conv)
    onOpenChange(false)
  }

  const toggleFriend = (id: string) => {
    setSelectedFriends(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{typeLabelPlural}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'list' | 'create')}>
          <TabsList className="w-full">
            <TabsTrigger value="list" className="flex-1">
              {typeLabelPlural}
            </TabsTrigger>
            <TabsTrigger value="create" className="flex-1">
              <Plus className="w-4 h-4 mr-1" />
              Criar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            <ScrollArea className="h-80">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Carregando...
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Nenhum {typeLabel.toLowerCase()} encontrado</p>
                  <Button variant="link" onClick={() => setTab('create')}>
                    Criar novo {typeLabel.toLowerCase()}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => joinConversation(conv)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 text-left"
                    >
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={conv.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary">
                          {type === 'group' && <Users className="w-5 h-5" />}
                          {type === 'channel' && <Radio className="w-5 h-5" />}
                          {type === 'community' && <MessageCircle className="w-5 h-5" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{conv.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {conv.participants?.length || 0} participantes
                        </p>
                        {conv.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {conv.description}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="create" className="mt-4 space-y-4">
            <Input
              placeholder={`Nome do ${typeLabel.toLowerCase()}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Textarea
              placeholder="Descrição (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />

            {type !== 'channel' && (
              <div>
                <p className="text-sm font-medium mb-2">Adicionar membros</p>
                <ScrollArea className="h-40 border rounded-lg p-2">
                  {friends.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Adicione amigos primeiro
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {friends.map((friend) => (
                        <label
                          key={friend.id}
                          className="flex items-center gap-3 p-2 rounded hover:bg-accent/50 cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedFriends.includes(friend.id)}
                            onCheckedChange={() => toggleFriend(friend.id)}
                          />
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={friend.avatar_url || undefined} />
                            <AvatarFallback>
                              {friend.display_name?.charAt(0) || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">
                            {friend.display_name || friend.email}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}

            <Button
              onClick={createConversation}
              disabled={!name.trim() || creating}
              className="w-full"
            >
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar {typeLabel}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
