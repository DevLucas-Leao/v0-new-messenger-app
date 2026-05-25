'use client'

import { useAuth, AuthProvider } from '@/components/auth-provider'
import { LoginForm } from '@/components/login-form'
import { ChatLayout } from '@/components/chat/chat-layout'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

function MainContent() {
  const { user, loading } = useAuth()
  const [forceDisableLoading, setForceDisableLoading] = useState(false)

  // Trava de segurança: Se demorar mais de 2 segundos para responder, ignora o carregamento
  useEffect(() => {
    const timer = setTimeout(() => {
      setForceDisableLoading(true)
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  // Só mostra a tela de carregamento se o Supabase responder rápido. Caso contrário, libera a página.
  if (loading && !forceDisableLoading) {
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
