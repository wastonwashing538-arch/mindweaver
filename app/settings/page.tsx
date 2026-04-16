'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Sun, Moon, LogOut, Trash2, Check } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

interface UsageData {
  currentMonth: {
    total: number
    prompt: number
    completion: number
    callCount: number
  }
  quota: {
    limit: number
    tier: string
  }
}

function formatTokens(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString()
}

function UsageSection() {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/usage')
      .then(r => r.ok ? r.json() : null)
      .then(data => { setUsage(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 mb-4">
        <div className="px-4 py-4">
          <div className="h-3 w-20 bg-neutral-800 rounded animate-pulse mb-3" />
          <div className="h-2 w-full bg-neutral-800 rounded animate-pulse" />
        </div>
      </section>
    )
  }

  if (!usage) return null

  const { total, callCount } = usage.currentMonth
  const { limit, tier } = usage.quota
  const pct = Math.min((total / limit) * 100, 100)
  const remaining = Math.max(limit - total, 0)
  const isNearLimit = pct >= 80

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900 mb-4">
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500">本月用量</span>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: tier === 'pro' ? 'rgba(161,100,30,0.2)' : 'rgba(82,82,82,0.3)',
              color: tier === 'pro' ? '#d4a96a' : '#737373',
            }}
          >
            {tier === 'pro' ? 'Pro' : '免费版'}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-neutral-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: isNearLimit ? '#ef4444' : '#78716c',
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: isNearLimit ? '#f87171' : '#737373' }}>
              已用 {formatTokens(total)} token
            </span>
            <span className="text-neutral-600">
              剩余 {formatTokens(remaining)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-neutral-600 pt-0.5 border-t border-neutral-800">
          <span>本月对话 {callCount} 次</span>
          <span>上限 {formatTokens(limit)}</span>
        </div>

        {isNearLimit && tier === 'free' && (
          <p className="text-xs text-amber-500/80 bg-amber-950/20 rounded-lg px-3 py-2">
            免费额度即将用尽，下月自动重置。
          </p>
        )}
      </div>
    </section>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, isLoggedIn, isLoading, signOut } = useAuth()
  const [isDark, setIsDark] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // AI settings
  const [aiLang, setAiLang] = useState<'zh' | 'en'>('zh')
  const [customInstructions, setCustomInstructions] = useState('')
  const [savedInstructions, setSavedInstructions] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Redirect if not logged in
  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.replace('/auth?redirect=/settings')
    }
  }, [isLoggedIn, isLoading, router])

  // Sync theme + AI settings from localStorage
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
    try {
      setAiLang((localStorage.getItem('mw-ai-lang') as 'zh' | 'en') || 'zh')
      setCustomInstructions(localStorage.getItem('mw-custom-instructions') || '')
    } catch {}
  }, [])

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('mw-theme', next ? 'dark' : 'light') } catch {}
  }

  function switchLang(lang: 'zh' | 'en') {
    setAiLang(lang)
    try { localStorage.setItem('mw-ai-lang', lang) } catch {}
  }

  function saveCustomInstructions() {
    try { localStorage.setItem('mw-custom-instructions', customInstructions) } catch {}
    setSavedInstructions(true)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => setSavedInstructions(false), 2000)
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    await signOut()
    router.replace('/')
  }

  async function handleDeleteAccount() {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setDeleteError(data.error ?? '删除失败，请重试')
        setIsDeleting(false)
        return
      }
      router.replace('/')
    } catch {
      setDeleteError('网络错误，请重试')
      setIsDeleting(false)
    }
  }

  if (isLoading || !isLoggedIn) {
    return <div className="min-h-screen bg-neutral-950" />
  }

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-8">
      <div className="max-w-sm mx-auto">

        {/* Back */}
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors mb-8"
        >
          <ArrowLeft size={12} />
          返回
        </button>

        {/* Brand */}
        <h1
          className="text-neutral-100 mb-8"
          style={{
            fontFamily: 'var(--font-brand), Georgia, serif',
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: '1.5rem',
          }}
        >
          MindWeaver
        </h1>

        {/* Token Usage */}
        <UsageSection />

        {/* Account */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 mb-4">
          <div className="px-4 py-3.5 flex items-center justify-between">
            <span className="text-xs text-neutral-500">登录账号</span>
            <span className="text-sm text-neutral-300 truncate max-w-[200px]">{user?.email}</span>
          </div>
        </section>

        {/* AI Settings */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800 mb-4">
          {/* Language */}
          <div className="px-4 py-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-500">AI 回复语言</p>
            </div>
            <div className="flex items-center gap-1 bg-neutral-800 rounded-lg p-0.5">
              <button
                onClick={() => switchLang('zh')}
                className={`px-2.5 py-1 rounded-md text-xs transition-all duration-150 ${
                  aiLang === 'zh'
                    ? 'bg-neutral-700 text-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                中文
              </button>
              <button
                onClick={() => switchLang('en')}
                className={`px-2.5 py-1 rounded-md text-xs transition-all duration-150 ${
                  aiLang === 'en'
                    ? 'bg-neutral-700 text-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                English
              </button>
            </div>
          </div>

          {/* Custom Instructions */}
          <div className="px-4 py-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-neutral-500">自定义指令</p>
                <p className="text-[11px] text-neutral-700 mt-0.5">告诉 AI 关于你自己，或你希望它的回答风格</p>
              </div>
              <button
                onClick={saveCustomInstructions}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all duration-200 ${
                  savedInstructions
                    ? 'text-emerald-400 bg-emerald-950/30'
                    : 'text-neutral-500 hover:text-neutral-300 bg-neutral-800 hover:bg-neutral-700'
                }`}
              >
                {savedInstructions ? <><Check size={11} />已保存</> : '保存'}
              </button>
            </div>
            <textarea
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              placeholder="例：我是一名产品经理，偏好简洁有力的表达，不喜欢冗长列举…"
              rows={3}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-xs text-neutral-300 placeholder:text-neutral-600 resize-none outline-none focus:border-neutral-600 transition-colors leading-relaxed"
            />
          </div>
        </section>

        {/* Appearance */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 mb-4">
          <div className="px-4 py-3.5 flex items-center justify-between">
            <span className="text-xs text-neutral-500">外观</span>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-1.5 text-sm text-neutral-300 hover:text-neutral-100 transition-colors"
            >
              {isDark
                ? <><Moon size={13} strokeWidth={1.8} /><span>深色</span></>
                : <><Sun size={13} strokeWidth={1.8} /><span>浅色</span></>
              }
            </button>
          </div>
        </section>

        {/* Sign out */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 mb-4">
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full px-4 py-3.5 flex items-center gap-2.5 text-sm text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-40"
          >
            <LogOut size={14} strokeWidth={1.8} />
            {isSigningOut ? '退出中…' : '退出登录'}
          </button>
        </section>

        {/* Delete account */}
        <section className="rounded-2xl border border-red-950/50 bg-neutral-900">
          {!deleteConfirm ? (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="w-full px-4 py-3.5 flex items-center gap-2.5 text-sm transition-colors"
              style={{ color: 'rgba(239,68,68,0.6)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.9)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.6)')}
            >
              <Trash2 size={14} strokeWidth={1.8} />
              注销账号
            </button>
          ) : (
            <div className="px-4 py-4 space-y-3">
              <p className="text-xs text-neutral-400 leading-relaxed">
                注销后账号和所有对话数据将
                <span className="text-red-400 font-medium">永久删除</span>
                ，无法恢复。确认继续？
              </p>
              {deleteError && (
                <p className="text-xs text-red-400">{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setDeleteConfirm(false); setDeleteError(null) }}
                  className="flex-1 py-2 rounded-lg text-xs text-neutral-500 hover:text-neutral-300 border border-neutral-700 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="flex-1 py-2 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-40"
                  style={{ backgroundColor: 'rgba(153,27,27,0.5)' }}
                  onMouseEnter={e => { if (!isDeleting) e.currentTarget.style.backgroundColor = 'rgba(153,27,27,0.75)' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(153,27,27,0.5)' }}
                >
                  {isDeleting ? '删除中…' : '确认注销'}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Footer links */}
        <div className="mt-8 flex gap-4 justify-center text-xs text-neutral-700">
          <a href="/privacy" className="hover:text-neutral-500 transition-colors">隐私政策</a>
          <a href="/terms" className="hover:text-neutral-500 transition-colors">用户协议</a>
        </div>

      </div>
    </div>
  )
}
