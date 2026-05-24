export type UserRole = 'user' | 'vip' | 'admin' | 'super_admin'

export interface Profile {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  phone: string | null
  role: UserRole
  is_banned: boolean
  banned_at: string | null
  banned_reason: string | null
  last_seen: string
  created_at: string
}

export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'rejected' | 'blocked'
  created_at: string
  requester?: Profile
  addressee?: Profile
}

export type ConversationType = 'direct' | 'group' | 'channel' | 'community'

export interface Conversation {
  id: string
  type: ConversationType
  name: string | null
  description: string | null
  avatar_url: string | null
  created_by: string | null
  parent_community_id: string | null
  settings: Record<string, unknown>
  created_at: string
  participants?: ConversationParticipant[]
  last_message?: Message
  unread_count?: number
}

export interface ConversationParticipant {
  id: string
  conversation_id: string
  user_id: string
  role: 'member' | 'admin' | 'owner'
  joined_at: string
  muted_until: string | null
  profile?: Profile
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'system'

export interface Message {
  id: string
  conversation_id: string
  sender_id: string | null
  content: string | null
  type: MessageType
  media_url: string | null
  reply_to_id: string | null
  is_edited: boolean
  is_deleted: boolean
  created_at: string
  sender?: Profile
  reply_to?: Message
}

export interface Story {
  id: string
  user_id: string
  content: string | null
  media_url: string | null
  type: 'text' | 'image' | 'video'
  background_color: string
  expires_at: string
  created_at: string
  user?: Profile
  views_count?: number
  viewed?: boolean
}

export interface StoryView {
  id: string
  story_id: string
  viewer_id: string
  viewed_at: string
  viewer?: Profile
}

export interface AdminLog {
  id: string
  admin_id: string | null
  action: string
  target_user_id: string | null
  target_conversation_id: string | null
  details: Record<string, unknown> | null
  created_at: string
  admin?: Profile
  target_user?: Profile
}

export const SUPER_ADMIN_EMAIL = 'lucaslcloux12@gmail.com'

export function isSuperAdmin(profile: Profile | null): boolean {
  if (!profile) return false
  return profile.role === 'super_admin' || profile.email === SUPER_ADMIN_EMAIL
}

export function isAdminOrAbove(profile: Profile | null): boolean {
  if (!profile) return false
  return profile.role === 'admin' || profile.role === 'super_admin'
}
