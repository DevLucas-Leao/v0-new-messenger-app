'use client'

import { useAuth, AuthProvider } from '@/components/auth-provider'
import { LoginForm } from '@/components/login-form'
import { ChatLayout } from '@/components/chat/chat-layout'

function MainContent() {
  const { user } = useAuth()

  // Se existir um usuário logado validado, abre o chat. Caso contrário, joga direto na tela de login.
  if (user) {
    return <ChatLayout />
  }

  return <LoginForm />
}

export default function HomePage() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  )
}
