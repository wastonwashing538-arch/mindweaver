'use client'

import { useState } from 'react'
import { X, ArrowRight, Loader2 } from 'lucide-react'

interface BetaRegistrationModalProps {
  open: boolean
  spotsLeft: number
  onClose: () => void
  onSuccess: () => void
}

const USE_CASES = [
  'Web3 代币经济学投研',
  '智能合约安全审计',
  '链上自动化脚本开发',
  'AI 产品开发测试',
  '其他',
]

const SOURCES = [
  'Twitter / X',
  'Telegram 社群',
  '朋友 / 同事推荐',
  'GitHub',
  '其他',
]

export function BetaRegistrationModal({ open, spotsLeft, onClose, onSuccess }: BetaRegistrationModalProps) {
  const [form, setForm] = useState({ nickname: '', twitter: '', useCase: '', source: '' })
  const [step, setStep] = useState<'form' | 'claiming' | 'success'>('form')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function set(key: keyof typeof form, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nickname.trim()) { setError('请填写你的昵称或 Twitter ID'); return }
    setError(null)
    setStep('claiming')

    try {
      const res = await fetch('/api/beta/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: form.nickname.trim(),
          twitter: form.twitter.trim() || undefined,
          useCase: form.useCase || undefined,
          source: form.source || undefined,
        }),
      })
      const data = await res.json()

      if (res.status === 401 && data.error === 'LOGIN_REQUIRED') {
        window.location.href = '/auth?redirect=/'
        return
      }
      if (data.ok) {
        setStep('success')
        setTimeout(() => { onSuccess(); window.location.reload() }, 2000)
      } else if (data.error === 'BETA_FULL') {
        setError('名额已全部抢光，请关注我们的 Twitter 等候正式上线！')
        setStep('form')
      } else {
        setError(data.message ?? '申请失败，请重试。')
        setStep('form')
      }
    } catch {
      setError('网络错误，请重试。')
      setStep('form')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => step === 'form' && onClose()}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div
        className="relative z-10 w-full max-w-sm bg-neutral-950 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {step === 'success' ? (
          <div className="px-6 py-10 text-center space-y-3">
            <div className="text-4xl mb-2">🎉</div>
            <h3 className="text-lg font-black text-amber-300">内测名额已到账！</h3>
            <p className="text-sm text-neutral-400">50 次 Claude 顶配调用已激活，页面即将刷新…</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-gradient-to-b from-amber-950/60 to-transparent px-5 pt-5 pb-4">
              <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors">
                <X size={14} />
              </button>
              <div className="text-[11px] font-black uppercase tracking-widest text-amber-500 mb-1.5">⚡ 内测登记</div>
              <h2 className="text-base font-black text-neutral-100 leading-snug">
                留下你的信息，加入创始团队
              </h2>
              <p className="text-xs text-neutral-500 mt-1">
                仅剩 <span className="text-amber-400 font-bold">{spotsLeft}</span> 个名额 · 填写后立即到账 50 次 Claude
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">
              {/* Nickname */}
              <div>
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide">
                  昵称 / Twitter ID <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.nickname}
                  onChange={e => set('nickname', e.target.value)}
                  placeholder="e.g. @your_handle"
                  maxLength={50}
                  className="mt-1 w-full bg-neutral-900 border border-neutral-700 focus:border-amber-500/50 rounded-xl px-3.5 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none transition-colors"
                />
              </div>

              {/* Twitter (optional) */}
              <div>
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide">Twitter 主页链接 <span className="text-neutral-600 font-normal normal-case">（选填）</span></label>
                <input
                  type="text"
                  value={form.twitter}
                  onChange={e => set('twitter', e.target.value)}
                  placeholder="https://x.com/..."
                  maxLength={100}
                  className="mt-1 w-full bg-neutral-900 border border-neutral-700 focus:border-amber-500/50 rounded-xl px-3.5 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none transition-colors"
                />
              </div>

              {/* Use case */}
              <div>
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide">主要使用场景</label>
                <select
                  value={form.useCase}
                  onChange={e => set('useCase', e.target.value)}
                  className="mt-1 w-full bg-neutral-900 border border-neutral-700 focus:border-amber-500/50 rounded-xl px-3.5 py-2.5 text-sm text-neutral-300 outline-none transition-colors appearance-none"
                >
                  <option value="">请选择…</option>
                  {USE_CASES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Source */}
              <div>
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide">从哪里得知 MindWeaver</label>
                <select
                  value={form.source}
                  onChange={e => set('source', e.target.value)}
                  className="mt-1 w-full bg-neutral-900 border border-neutral-700 focus:border-amber-500/50 rounded-xl px-3.5 py-2.5 text-sm text-neutral-300 outline-none transition-colors appearance-none"
                >
                  <option value="">请选择…</option>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {error && <p className="text-xs text-red-400 break-all">{error}</p>}

              <button
                type="submit"
                disabled={step === 'claiming'}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-neutral-900 text-sm font-black hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-60 mt-1"
              >
                {step === 'claiming' ? (
                  <><Loader2 size={14} className="animate-spin" />申请中…</>
                ) : (
                  <>立即抢占内测名额 <ArrowRight size={14} /></>
                )}
              </button>

              <p className="text-center text-[10px] text-neutral-700 leading-relaxed">
                信息仅用于社区运营，不会公开或转让。
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
