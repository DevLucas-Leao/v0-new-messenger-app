'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'
import { SUPER_ADMIN_EMAIL } from '@/lib/constants'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  isSuperAdmin: boolean
  isAdmin: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      
      if (data) {
        setProfile(data)
        // Update last_seen
        await supabase
          .from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', userId)
      } else {
        // Se a conta não tem perfil criado ainda, não deixa o state nulo travar a tela
        setProfile(null)
      }
    } catch (error) {
      console.error("Erro ao buscar perfil:", error)
    } finally {
      // GARANTE QUE DESLIGA O LOADING MESMO SE NÃO ACHAR PERFIL NO BANCO
      setLoading(false)
    }
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id)
    }
  }, [user, fetchProfile])

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setLoading(false)
        }
      } catch (error) {
        console.error("Erro na sessão:", error)
        setLoading(false)
      }
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase, fetchProfile])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  // Definição de segurança para garantir o acesso de admin por e-mail mesmo sem perfil na tabela
  const isSuperAdmin = profile?.role === 'super_admin' || user?.email === SUPER_ADMIN_EMAIL || profile?.email === SUPER_ADMIN_EMAIL
  const isAdmin = profile?.role === 'admin' || isSuperAdmin

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      isSuperAdmin,
      isAdmin,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
