'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

// Inner component uses useSearchParams, must be inside <Suspense>
function AuthForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn, signUp, isLoggedIn, isLoading } = useAuth()

  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signUpSuccess, setSignUpSuccess] = useState(false)

  const redirectTo = searchParams.get('redirect') ?? '/'

  // If already logged in, redirect away
  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      router.replace(redirectTo)
    }
  }, [isLoggedIn, isLoading, router, redirectTo])

  // Show confirmation error if redirected back with error
  useEffect(() => {
    if (searchParams.get('error') === 'confirmation_failed') {
      setError('邮箱确认失败，请重试。')
    }
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    if (tab === 'signin') {
      const err = await signIn(email, password)
      if (err) {
        setError(getErrorMessage(err.message))
      } else {
        router.replace(redirectTo)
      }
    } else {
      const err = await signUp(email, password)
      if (err) {
        setError(getErrorMessage(err.message))
      } else {
        setSignUpSuccess(true)
      }
    }

    setIsSubmitting(false)
  }

  function getErrorMessage(msg: string): string {
    if (msg.includes('Invalid login credentials')) return '邮箱或密码错误'
    if (msg.includes('Email not confirmed')) return '邮箱尚未确认，请查收确认邮件'
    if (msg.includes('User already registered')) return '该邮箱已注册，请直接登录'
    if (msg.includes('Password should be at least')) return '密码至少需要6位'
    if (msg.includes('rate limit')) return '请求过于频繁，请稍后重试'
    if (msg.includes('Auth not configured')) return '认证服务尚未配置，请联系管理员'
    return msg
  }

  if (signUpSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-4">
        <div
          className="w-full max-w-sm rounded-2xl border border-neutral-800 p-8 text-center"
          style={{ backgroundColor: 'var(--color-neutral-900)' }}
        >
          <div className="text-3xl mb-4">✉️</div>
          <h2 className="text-neutral-100 text-lg font-medium mb-2">查收确认邮件</h2>
          <p className="text-neutral-500 text-sm leading-relaxed">
            已发送确认邮件到<br />
            <span className="text-neutral-300 font-medium">{email}</span><br />
            点击邮件中的链接激活账号。
          </p>
          <button
            onClick={() => { setSignUpSuccess(false); setTab('signin') }}
            className="mt-6 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            返回登录
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="MindWeaver" className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 shadow-lg" />
          <h1
            className="text-neutral-100 select-none mb-1"
            style={{
              fontFamily: 'var(--font-brand), Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: '1.75rem',
              letterSpacing: '0.01em',
            }}
          >
            MindWeaver
          </h1>
          <p className="text-neutral-600 text-sm">分支思考，向上整合</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border border-neutral-800 p-6"
          style={{ backgroundColor: 'var(--color-neutral-900)' }}
        >
          {/* Tab switcher */}
          <div className="flex rounded-lg bg-neutral-800 p-0.5 mb-5">
            <button
              onClick={() => { setTab('signin'); setError(null) }}
              className={`flex-1 py-1.5 text-sm rounded-md transition-all duration-150 ${
                tab === 'signin'
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              登录
            </button>
            <button
              onClick={() => { setTab('signup'); setError(null) }}
              className={`flex-1 py-1.5 text-sm rounded-md transition-all duration-150 ${
                tab === 'signup'
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              placeholder="邮箱"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-100 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
            />
            <input
              type="password"
              placeholder="密码（至少6位）"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-100 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
            />

            {error && (
              <p className="text-xs text-red-400 px-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !email || !password}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: '#5D4037',
                color: '#FFFFFF',
              }}
              onMouseEnter={e => { if (!isSubmitting) e.currentTarget.style.backgroundColor = '#6D4C41' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#5D4037' }}
            >
              {isSubmitting ? '处理中…' : tab === 'signin' ? '登录' : '注册'}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-neutral-800 text-center space-y-3">
            <button
              onClick={() => router.push('/')}
              className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              跳过，先体验
            </button>
            {tab === 'signup' && (
              <p className="text-xs text-neutral-700 leading-relaxed">
                注册即表示同意
                <a href="/terms" className="text-neutral-500 hover:text-neutral-300 transition-colors mx-1">用户协议</a>
                和
                <a href="/privacy" className="text-neutral-500 hover:text-neutral-300 transition-colors mx-1">隐私政策</a>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-neutral-950" />
    }>
      <AuthForm />
    </Suspense>
  )
}
