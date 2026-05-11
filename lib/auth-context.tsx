'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, AuthError } from '@supabase/supabase-js'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { posthog } from '@/lib/posthog'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isLoggedIn: boolean
  signIn: (email: string, password: string) => Promise<AuthError | null>
  signUp: (email: string, password: string) => Promise<AuthError | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = isSupabaseConfigured ? createClient() : null

  useEffect(() => {
    // If Supabase is not configured, treat as guest (not loading)
    if (!supabase) {
      setIsLoading(false)
      return
    }

    // Get initial session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setIsLoading(false)
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        setIsLoading(false)

        // Trigger localStorage migration on first sign-in
        if (event === 'SIGNED_IN') {
          triggerMigration()
        }
      }
    )

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function triggerMigration() {
    // Only migrate if not already done
    if (typeof window === 'undefined') return
    if (localStorage.getItem('mw-migrated') === 'true') return

    try {
      const raw = localStorage.getItem('mw-conversations')
      if (!raw) return
      const conversations = JSON.parse(raw)
      if (!Array.isArray(conversations) || conversations.length === 0) return

      const res = await fetch('/api/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conversations),
      })

      if (res.ok) {
        localStorage.setItem('mw-migrated', 'true')
        // Keep localStorage data as cache — ConversationContext reload will happen
      }
    } catch {
      // Migration failure is non-fatal — data stays in localStorage
    }
  }

  async function signIn(email: string, password: string): Promise<AuthError | null> {
    if (!supabase) return { name: 'AuthError', message: 'Auth not configured' } as AuthError
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error && data.user) {
      posthog.identify(data.user.id, { email: data.user.email })
      posthog.capture('user_login')
    }
    return error
  }

  async function signUp(email: string, password: string): Promise<AuthError | null> {
    if (!supabase) return { name: 'AuthError', message: 'Auth not configured' } as AuthError
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (!error && data.user) {
      posthog.identify(data.user.id, { email: data.user.email })
      posthog.capture('user_signup')
    }
    return error
  }

  async function signOut() {
    posthog.capture('user_logout')
    posthog.reset()
    if (supabase) await supabase.auth.signOut()
    // Clear migration flag so re-login can re-migrate if needed
    localStorage.removeItem('mw-migrated')
  }

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isLoggedIn: user !== null,
      signIn,
      signUp,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
