'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import { ChatSidebar } from '@/components/chat/chat-sidebar'
import { ChatArea } from '@/components/chat/chat-area'
import { NewChatDialog } from '@/components/chat/new-chat-dialog'
import { GroupsDialog } from '@/components/chat/groups-dialog'
import { StoriesDialog } from '@/components/chat/stories-dialog'
import { SettingsDialog } from '@/components/chat/settings-dialog'
import { AdminPanel } from '@/components/admin/admin-panel'
import type { Conversation, ConversationType } from '@/lib/types'
import { MessageCircle } from 'lucide-react'

export function ChatLayout() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [showMobileChat, setShowMobileChat] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [groupsDialogOpen, setGroupsDialogOpen] = useState(false)
  const [groupsDialogType, setGroupsDialogType] = useState<ConversationType>('group')
  const [storiesOpen, setStoriesOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [conversationInfoOpen, setConversationInfoOpen] = useState(false)
  const { profile } = useAuth()
  const supabase = createClient()

  const handleSelectConversation = useCallback(async (conv: Conversation) => {
    // Fetch full conversation with participants
    const { data } = await supabase
      .from('conversations')
      .select(`
        *,
        participants:conversation_participants(
          *,
          profile:profiles(*)
        )
      `)
      .eq('id', conv.id)
      .single()

    if (data) {
      setSelectedConversation(data)
      setShowMobileChat(true)
    }
  }, [supabase])

  const handleStartChat = useCallback(async (conversationId: string) => {
    const { data } = await supabase
      .from('conversations')
      .select(`
        *,
        participants:conversation_participants(
          *,
          profile:profiles(*)
        )
      `)
      .eq('id', conversationId)
      .single()

    if (data) {
      setSelectedConversation(data)
      setShowMobileChat(true)
    }
  }, [supabase])

  const handleOpenGroups = () => {
    setGroupsDialogType('group')
    setGroupsDialogOpen(true)
  }

  const handleOpenChannels = () => {
    setGroupsDialogType('channel')
    setGroupsDialogOpen(true)
  }

  const handleOpenCommunities = () => {
    setGroupsDialogType('community')
    setGroupsDialogOpen(true)
  }

  const handleBack = () => {
    setShowMobileChat(false)
  }

  // Subscribe to profile ban status
  useEffect(() => {
    if (!profile) return

    const channel = supabase
      .channel('profile-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          if (payload.new.is_banned) {
            window.location.reload()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile, supabase])

  // Check if user is banned
  if (profile?.is_banned) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Conta Banida</h1>
          <p className="text-muted-foreground mb-4">
            Sua conta foi banida por violar os termos de uso.
          </p>
          {profile.banned_reason && (
            <p className="text-sm text-muted-foreground">
              Motivo: {profile.banned_reason}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-background">
      {/* Sidebar - hidden on mobile when chat is open */}
      <div className={`${showMobileChat ? 'hidden md:flex' : 'flex'} w-full md:w-auto`}>
        <ChatSidebar
          selectedConversation={selectedConversation}
          onSelectConversation={handleSelectConversation}
          onOpenNewChat={() => setNewChatOpen(true)}
          onOpenGroups={handleOpenGroups}
          onOpenChannels={handleOpenChannels}
          onOpenCommunities={handleOpenCommunities}
          onOpenStories={() => setStoriesOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAdmin={() => setAdminOpen(true)}
        />
      </div>

      {/* Chat area */}
      <div className={`${showMobileChat ? 'flex' : 'hidden md:flex'} flex-1`}>
        {selectedConversation ? (
          <ChatArea
            conversation={selectedConversation}
            onBack={handleBack}
            onOpenInfo={() => setConversationInfoOpen(true)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-muted/30">
            <div className="text-center">
              <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-12 h-12 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">NewMessenger</h2>
              <p className="text-muted-foreground max-w-sm">
                Selecione uma conversa ou inicie uma nova para começar a conversar
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <NewChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        onStartChat={handleStartChat}
      />

      <GroupsDialog
        open={groupsDialogOpen}
        onOpenChange={setGroupsDialogOpen}
        type={groupsDialogType}
        onSelectConversation={handleSelectConversation}
      />

      <StoriesDialog
        open={storiesOpen}
        onOpenChange={setStoriesOpen}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <AdminPanel
        open={adminOpen}
        onOpenChange={setAdminOpen}
        onViewConversation={(conv) => {
          handleSelectConversation(conv)
          setAdminOpen(false)
        }}
      />
    </div>
  )
}
