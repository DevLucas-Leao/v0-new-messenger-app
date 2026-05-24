'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import type { Profile, Conversation, AdminLog } from '@/lib/types'
import { ROLE_LABELS, ROLE_COLORS, SUPER_ADMIN_EMAIL } from '@/lib/constants'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Search,
  Users,
  MessageSquare,
  Shield,
  Ban,
  CheckCircle,
  MoreVertical,
  Crown,
  Star,
  UserX,
  Eye,
  Trash2,
  History,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

interface AdminPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onViewConversation: (conversation: Conversation) => void
}

export function AdminPanel({ open, onOpenChange, onViewConversation }: AdminPanelProps) {
  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState<Profile[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [logs, setLogs] = useState<AdminLog[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmAction, setConfirmAction] = useState<{
    title: string
    description: string
    action: () => Promise<void>
  } | null>(null)
  const { profile, isSuperAdmin } = useAuth()
  const supabase = createClient()

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) {
      setUsers(data)
    }
    setLoading(false)
  }, [supabase])

  const fetchConversations = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select(`
        *,
        participants:conversation_participants(
          *,
          profile:profiles(*)
        )
      `)
      .order('created_at', { ascending: false })

    if (data) {
      setConversations(data)
    }
    setLoading(false)
  }, [supabase])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('admin_logs')
      .select(`
        *,
        admin:profiles!admin_logs_admin_id_fkey(*),
        target_user:profiles!admin_logs_target_user_id_fkey(*)
      `)
      .order('created_at', { ascending: false })
      .limit(100)

    if (data) {
      setLogs(data)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    if (open && isSuperAdmin) {
      if (tab === 'users') fetchUsers()
      else if (tab === 'conversations') fetchConversations()
      else if (tab === 'logs') fetchLogs()
    }
  }, [open, tab, isSuperAdmin, fetchUsers, fetchConversations, fetchLogs])

  const logAction = async (action: string, targetUserId?: string, targetConvId?: string, details?: Record<string, unknown>) => {
    if (!profile) return
    await supabase.from('admin_logs').insert({
      admin_id: profile.id,
      action,
      target_user_id: targetUserId,
      target_conversation_id: targetConvId,
      details,
    })
  }

  const updateUserRole = async (userId: string, newRole: string) => {
    const targetUser = users.find(u => u.id === userId)
    if (targetUser?.email === SUPER_ADMIN_EMAIL) {
      toast.error('Não é possível alterar o super admin')
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) {
      toast.error('Erro ao atualizar cargo')
    } else {
      toast.success('Cargo atualizado!')
      await logAction(`role_change_${newRole}`, userId, undefined, { new_role: newRole })
      fetchUsers()
    }
  }

  const toggleBan = async (userId: string, ban: boolean) => {
    const targetUser = users.find(u => u.id === userId)
    if (targetUser?.email === SUPER_ADMIN_EMAIL) {
      toast.error('Não é possível banir o super admin')
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        is_banned: ban,
        banned_at: ban ? new Date().toISOString() : null,
        banned_reason: ban ? 'Banido pelo administrador' : null,
      })
      .eq('id', userId)

    if (error) {
      toast.error(`Erro ao ${ban ? 'banir' : 'desbanir'} usuário`)
    } else {
      toast.success(`Usuário ${ban ? 'banido' : 'desbanido'}!`)
      await logAction(ban ? 'user_ban' : 'user_unban', userId)
      fetchUsers()
    }
  }

  const deleteConversation = async (convId: string) => {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', convId)

    if (error) {
      toast.error('Erro ao deletar conversa')
    } else {
      toast.success('Conversa deletada!')
      await logAction('conversation_delete', undefined, convId)
      fetchConversations()
    }
  }

  const joinAsOwner = async (conv: Conversation) => {
    if (!profile) return

    // Check if already participant
    const isParticipant = conv.participants?.some(p => p.user_id === profile.id)

    if (!isParticipant) {
      // Add as participant with owner role
      await supabase.from('conversation_participants').insert({
        conversation_id: conv.id,
        user_id: profile.id,
        role: 'owner',
      })
    } else {
      // Update to owner
      await supabase
        .from('conversation_participants')
        .update({ role: 'owner' })
        .eq('conversation_id', conv.id)
        .eq('user_id', profile.id)
    }

    // Demote current owner if exists and not super admin
    const currentOwner = conv.participants?.find(p => p.role === 'owner' && p.user_id !== profile.id)
    if (currentOwner) {
      await supabase
        .from('conversation_participants')
        .update({ role: 'admin' })
        .eq('id', currentOwner.id)
    }

    toast.success('Você agora é dono deste grupo!')
    await logAction('join_as_owner', undefined, conv.id)
    fetchConversations()
    onViewConversation(conv)
    onOpenChange(false)
  }

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.display_name?.toLowerCase().includes(search.toLowerCase()))
  )

  const filteredConversations = conversations.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.type.toLowerCase().includes(search.toLowerCase())
  )

  if (!isSuperAdmin) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acesso Negado</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Você não tem permissão para acessar o painel de administração.
          </p>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-destructive" />
              Painel de Administração
            </DialogTitle>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="users" className="flex-1">
                <Users className="w-4 h-4 mr-2" />
                Usuários
              </TabsTrigger>
              <TabsTrigger value="conversations" className="flex-1">
                <MessageSquare className="w-4 h-4 mr-2" />
                Conversas
              </TabsTrigger>
              <TabsTrigger value="logs" className="flex-1">
                <History className="w-4 h-4 mr-2" />
                Logs
              </TabsTrigger>
            </TabsList>

            {/* Search bar */}
            {tab !== 'logs' && (
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            )}

            {/* Users Tab */}
            <TabsContent value="users" className="mt-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted-foreground">
                  {filteredUsers.length} usuários encontrados
                </p>
                <Button variant="outline" size="sm" onClick={fetchUsers}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Atualizar
                </Button>
              </div>

              <ScrollArea className="h-[400px]">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                ) : (
                  <div className="space-y-2">
                    {filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50"
                      >
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback>
                            {user.display_name?.charAt(0) || user.email.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">
                              {user.display_name || user.email}
                            </p>
                            <Badge className={ROLE_COLORS[user.role]}>
                              {ROLE_LABELS[user.role]}
                            </Badge>
                            {user.is_banned && (
                              <Badge variant="destructive">Banido</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {user.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Último acesso: {new Date(user.last_seen).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => updateUserRole(user.id, 'vip')}>
                              <Star className="w-4 h-4 mr-2 text-purple-500" />
                              Dar VIP
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateUserRole(user.id, 'admin')}>
                              <Crown className="w-4 h-4 mr-2 text-blue-500" />
                              Dar Admin
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateUserRole(user.id, 'user')}>
                              <UserX className="w-4 h-4 mr-2" />
                              Remover cargos
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {user.is_banned ? (
                              <DropdownMenuItem onClick={() => toggleBan(user.id, false)}>
                                <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                                Desbanir
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => setConfirmAction({
                                  title: 'Banir usuário',
                                  description: `Tem certeza que deseja banir ${user.display_name || user.email}?`,
                                  action: async () => toggleBan(user.id, true),
                                })}
                                className="text-destructive"
                              >
                                <Ban className="w-4 h-4 mr-2" />
                                Banir
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Conversations Tab */}
            <TabsContent value="conversations" className="mt-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted-foreground">
                  {filteredConversations.length} conversas encontradas
                </p>
                <Button variant="outline" size="sm" onClick={fetchConversations}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Atualizar
                </Button>
              </div>

              <ScrollArea className="h-[400px]">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                ) : (
                  <div className="space-y-2">
                    {filteredConversations.map((conv) => (
                      <div
                        key={conv.id}
                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50"
                      >
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={conv.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/20 text-primary">
                            {conv.type === 'direct' ? 'DM' : conv.name?.charAt(0) || 'C'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">
                              {conv.name || 'Conversa direta'}
                            </p>
                            <Badge variant="secondary">{conv.type}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {conv.participants?.length || 0} participantes
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Criado: {new Date(conv.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              onViewConversation(conv)
                              onOpenChange(false)
                            }}>
                              <Eye className="w-4 h-4 mr-2" />
                              Ver mensagens
                            </DropdownMenuItem>
                            {conv.type !== 'direct' && (
                              <DropdownMenuItem onClick={() => joinAsOwner(conv)}>
                                <Crown className="w-4 h-4 mr-2 text-yellow-500" />
                                Entrar como dono
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setConfirmAction({
                                title: 'Deletar conversa',
                                description: `Tem certeza que deseja deletar esta conversa? Todas as mensagens serão perdidas.`,
                                action: async () => deleteConversation(conv.id),
                              })}
                              className="text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Deletar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Logs Tab */}
            <TabsContent value="logs" className="mt-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted-foreground">
                  Últimas {logs.length} ações
                </p>
                <Button variant="outline" size="sm" onClick={fetchLogs}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Atualizar
                </Button>
              </div>

              <ScrollArea className="h-[400px]">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                ) : logs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum log encontrado
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="p-3 rounded-lg border text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{log.action}</Badge>
                            <span className="text-muted-foreground">por</span>
                            <span className="font-medium">
                              {log.admin?.display_name || log.admin?.email || 'Sistema'}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        {log.target_user && (
                          <p className="text-muted-foreground mt-1">
                            Alvo: {log.target_user.display_name || log.target_user.email}
                          </p>
                        )}
                        {log.details && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Detalhes: {JSON.stringify(log.details)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await confirmAction?.action()
                setConfirmAction(null)
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
