'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import type { Story, Profile } from '@/lib/types'
import { STORY_BACKGROUNDS } from '@/lib/constants'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Plus, X, ChevronLeft, ChevronRight, Eye, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface StoriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface StoryGroup {
  user: Profile
  stories: Story[]
  allViewed: boolean
}

export function StoriesDialog({ open, onOpenChange }: StoriesDialogProps) {
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([])
  const [myStories, setMyStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [viewingStory, setViewingStory] = useState<{ group: StoryGroup; index: number } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [selectedBg, setSelectedBg] = useState(STORY_BACKGROUNDS[0])
  const [creating, setCreating] = useState(false)
  const { profile } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    if (open && profile) {
      fetchStories()
    }
  }, [open, profile])

  const fetchStories = async () => {
    if (!profile) return
    setLoading(true)

    // Fetch my stories
    const { data: myData } = await supabase
      .from('stories')
      .select('*')
      .eq('user_id', profile.id)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    if (myData) {
      setMyStories(myData)
    }

    // Fetch friends' stories
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`)

    const friendIds = friendships?.map(f =>
      f.requester_id === profile.id ? f.addressee_id : f.requester_id
    ) || []

    if (friendIds.length > 0) {
      const { data: storiesData } = await supabase
        .from('stories')
        .select('*, user:profiles(*)')
        .in('user_id', friendIds)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })

      // Fetch my views
      const { data: myViews } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', profile.id)

      const viewedIds = new Set(myViews?.map(v => v.story_id) || [])

      // Group by user
      const groups = new Map<string, StoryGroup>()
      storiesData?.forEach(story => {
        if (story.user) {
          const existing = groups.get(story.user_id)
          const isViewed = viewedIds.has(story.id)
          if (existing) {
            existing.stories.push({ ...story, viewed: isViewed })
            if (!isViewed) existing.allViewed = false
          } else {
            groups.set(story.user_id, {
              user: story.user,
              stories: [{ ...story, viewed: isViewed }],
              allViewed: isViewed,
            })
          }
        }
      })

      setStoryGroups(Array.from(groups.values()))
    }

    setLoading(false)
  }

  const createStory = async () => {
    if (!profile || !newContent.trim()) return
    setCreating(true)

    const { error } = await supabase.from('stories').insert({
      user_id: profile.id,
      content: newContent.trim(),
      type: 'text',
      background_color: selectedBg,
    })

    if (error) {
      toast.error('Erro ao criar story')
    } else {
      toast.success('Story publicado!')
      setNewContent('')
      setShowCreate(false)
      fetchStories()
    }
    setCreating(false)
  }

  const viewStory = async (story: Story) => {
    if (!profile) return

    await supabase.from('story_views').insert({
      story_id: story.id,
      viewer_id: profile.id,
    }).select()
  }

  const openStoryViewer = (group: StoryGroup) => {
    setViewingStory({ group, index: 0 })
    viewStory(group.stories[0])
  }

  const nextStory = () => {
    if (!viewingStory) return
    const nextIndex = viewingStory.index + 1
    if (nextIndex < viewingStory.group.stories.length) {
      setViewingStory({ ...viewingStory, index: nextIndex })
      viewStory(viewingStory.group.stories[nextIndex])
    } else {
      // Find next group
      const currentGroupIndex = storyGroups.findIndex(g => g.user.id === viewingStory.group.user.id)
      if (currentGroupIndex < storyGroups.length - 1) {
        const nextGroup = storyGroups[currentGroupIndex + 1]
        setViewingStory({ group: nextGroup, index: 0 })
        viewStory(nextGroup.stories[0])
      } else {
        setViewingStory(null)
      }
    }
  }

  const prevStory = () => {
    if (!viewingStory) return
    if (viewingStory.index > 0) {
      setViewingStory({ ...viewingStory, index: viewingStory.index - 1 })
    }
  }

  const formatTimeAgo = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000 / 60)
    if (diff < 60) return `${diff}m`
    return `${Math.floor(diff / 60)}h`
  }

  if (viewingStory) {
    const story = viewingStory.group.stories[viewingStory.index]
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <div
            className="relative h-[600px] flex flex-col"
            style={{ backgroundColor: story.background_color }}
          >
            {/* Progress bars */}
            <div className="flex gap-1 p-2">
              {viewingStory.group.stories.map((_, i) => (
                <div key={i} className="flex-1 h-1 rounded-full bg-white/30">
                  <div
                    className={cn(
                      'h-full rounded-full bg-white transition-all',
                      i < viewingStory.index ? 'w-full' : i === viewingStory.index ? 'w-full' : 'w-0'
                    )}
                  />
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 p-3">
              <Avatar className="w-10 h-10 ring-2 ring-white">
                <AvatarImage src={viewingStory.group.user.avatar_url || undefined} />
                <AvatarFallback>
                  {viewingStory.group.user.display_name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium text-white">
                  {viewingStory.group.user.display_name || viewingStory.group.user.email}
                </p>
                <p className="text-xs text-white/70">{formatTimeAgo(story.created_at)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewingStory(null)}
                className="text-white hover:bg-white/20"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center p-6">
              <p className="text-2xl text-white text-center font-medium">
                {story.content}
              </p>
            </div>

            {/* Navigation */}
            <button
              onClick={prevStory}
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1/3 h-2/3"
            />
            <button
              onClick={nextStory}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-1/3 h-2/3"
            />

            {viewingStory.index > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={prevStory}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={nextStory}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (showCreate) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Criar Story</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div
              className="h-64 rounded-lg flex items-center justify-center p-4"
              style={{ backgroundColor: selectedBg }}
            >
              <Textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Digite seu story..."
                className="bg-transparent border-none text-white text-xl text-center placeholder:text-white/50 resize-none focus-visible:ring-0"
                rows={4}
              />
            </div>

            <div className="flex gap-2 flex-wrap justify-center">
              {STORY_BACKGROUNDS.map((bg) => (
                <button
                  key={bg}
                  onClick={() => setSelectedBg(bg)}
                  className={cn(
                    'w-8 h-8 rounded-full',
                    selectedBg === bg && 'ring-2 ring-primary ring-offset-2'
                  )}
                  style={{ backgroundColor: bg }}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={createStory} disabled={!newContent.trim() || creating} className="flex-1">
                {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Publicar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Stories</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-96">
          {/* My story */}
          <div className="mb-4">
            <p className="text-sm font-medium mb-2">Meu story</p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 w-full text-left"
            >
              <div className="relative">
                <Avatar className="w-14 h-14">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback>
                    {profile?.display_name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute bottom-0 right-0 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                  <Plus className="w-3 h-3 text-primary-foreground" />
                </div>
              </div>
              <div>
                <p className="font-medium">Adicionar story</p>
                {myStories.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {myStories.length} story(s) ativo(s)
                  </p>
                )}
              </div>
            </button>
          </div>

          {/* Friends' stories */}
          <div>
            <p className="text-sm font-medium mb-2">Atualizações recentes</p>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando...
              </div>
            ) : storyGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhum story disponível</p>
                <p className="text-xs">Adicione amigos para ver seus stories</p>
              </div>
            ) : (
              <div className="space-y-1">
                {storyGroups.map((group) => (
                  <button
                    key={group.user.id}
                    onClick={() => openStoryViewer(group)}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 w-full text-left"
                  >
                    <div
                      className={cn(
                        'p-0.5 rounded-full',
                        group.allViewed ? 'story-ring-viewed' : 'story-ring'
                      )}
                    >
                      <Avatar className="w-12 h-12 ring-2 ring-background">
                        <AvatarImage src={group.user.avatar_url || undefined} />
                        <AvatarFallback>
                          {group.user.display_name?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div>
                      <p className="font-medium">
                        {group.user.display_name || group.user.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {group.stories.length} story(s) - {formatTimeAgo(group.stories[0].created_at)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
