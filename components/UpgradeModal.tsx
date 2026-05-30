'use client'

import { useState } from 'react'
import { X, Zap, Check } from 'lucide-react'

interface UpgradeModalProps {
  open: boolean
  onClose: () => void
}

const FREE_FEATURES = ['每日 50 次对话', 'DeepSeek R1 模型']
const VIP_FEATURES = ['每月 3000 次对话', 'Claude Sonnet 4.6 模型', '更深的推理与综合能力', '优先响应速度']

export function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleUpgrade() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/creem/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else if (data.error === 'Payment not configured') {
        setError('支付功能暂未开放，请稍后再试。')
      } else {
        setError('跳转失败，请重试。')
      }
    } catch {
      setError('网络错误，请重试。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-sm bg-neutral-900 border border-neutral-700 rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
        >
          <X size={14} />
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
            <Zap size={18} className="text-amber-400" />
          </div>
          <h3 className="text-neutral-100 font-semibold text-base mb-1">升级 Pro</h3>
          <p className="text-neutral-500 text-sm">解锁更多次数和全部高级模型</p>
        </div>

        {/* Plan comparison */}
        <div className="mx-6 mb-4 grid grid-cols-2 gap-2">
          {/* Free */}
          <div className="bg-neutral-800/50 rounded-xl p-3 border border-neutral-700/50">
            <p className="text-neutral-400 text-xs font-medium mb-2">免费版</p>
            {FREE_FEATURES.map(f => (
              <div key={f} className="flex items-start gap-1.5 mb-1.5">
                <Check size={11} className="text-neutral-600 mt-0.5 shrink-0" />
                <span className="text-neutral-500 text-[11px] leading-snug">{f}</span>
              </div>
            ))}
          </div>
          {/* VIP */}
          <div className="bg-amber-500/5 rounded-xl p-3 border border-amber-500/20">
            <p className="text-amber-400 text-xs font-medium mb-2">Pro ✦</p>
            {VIP_FEATURES.map(f => (
              <div key={f} className="flex items-start gap-1.5 mb-1.5">
                <Check size={11} className="text-amber-400 mt-0.5 shrink-0" />
                <span className="text-neutral-300 text-[11px] leading-snug">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 pb-6 space-y-2">
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full h-10 rounded-xl bg-amber-500 text-neutral-900 text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-60"
          >
            {loading ? '跳转中…' : '立即升级 Pro →'}
          </button>
          <button onClick={onClose} className="w-full h-9 rounded-xl text-neutral-500 text-sm hover:text-neutral-300 transition-colors">
            稍后再说
          </button>
        </div>
      </div>
    </div>
  )
}
