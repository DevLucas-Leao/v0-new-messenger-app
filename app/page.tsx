'use client'

import { useAuth, AuthProvider } from '@/components/auth-provider'
import { LoginForm } from '@/components/login-form'
import { ChatLayout } from '@/components/chat/chat-layout'
import { Loader2 } from 'lucide-react'

function MainContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginForm />
  }

  return <ChatLayout />
}

export default function HomePage() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  )
}
