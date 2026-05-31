'use client'

import { useState } from 'react'
import { X, Zap, Check, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UpgradeModalProps {
  open: boolean
  onClose: () => void
  reason?: 'daily_limit' | 'preset_requires_paid' | 'monthly_limit'
}

const PLANS = [
  {
    id: 'starter' as const,
    name: 'Starter',
    price: '$4.9',
    period: '/月',
    calls: '1,000',
    tagline: '一瓶可乐钱',
    highlight: false,
    features: ['1,000 次 Claude 4.6 调用', '智能合约审计模式', '链上脚本自动化', '无每日次数限制'],
  },
  {
    id: 'standard' as const,
    name: 'Standard',
    price: '$9.9',
    period: '/月',
    calls: '3,000',
    tagline: '最受欢迎 🔥',
    highlight: true,
    features: ['3,000 次 Claude 4.6 调用', '全部专家工作台模式', '代币经济学深度投研', '无每日次数限制'],
  },
]

const REASON_COPY: Record<string, { title: string; sub: string }> = {
  daily_limit: {
    title: '今日 50 次免费额度已耗尽',
    sub: '升级解锁 Claude 4.6 高速通道，体验地表最强逻辑与代码重构能力。',
  },
  preset_requires_paid: {
    title: '此专家模式需要 Claude 4.6',
    sub: '智能合约审计 & 链上脚本模式依赖顶配推理能力，升级即刻解锁。',
  },
  monthly_limit: {
    title: '本月调用次数已到上限',
    sub: '升级到更高套餐，获得更多 Claude 4.6 调用额度。',
  },
  default: {
    title: '解锁 Claude 4.6 全速通道',
    sub: '告别 DeepSeek 每日限额，用顶配逻辑处理每一个深度问题。',
  },
}

export function UpgradeModal({ open, onClose, reason }: UpgradeModalProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const copy = REASON_COPY[reason ?? 'default'] ?? REASON_COPY.default

  async function handleUpgrade(plan: 'starter' | 'standard') {
    setLoading(plan)
    setError(null)
    try {
      const res = await fetch('/api/creem/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        const detail = data.detail ? JSON.stringify(data.detail).slice(0, 120) : data.error
        setError(`跳转失败：${detail}`)
        setLoading(null)
      }
    } catch (e) {
      setError(`网络错误：${String(e)}`)
      setLoading(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative z-10 w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors z-10">
          <X size={14} />
        </button>

        {/* Header */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center">
              <Flame size={16} className="text-amber-400" />
            </div>
            <span className="text-[11px] text-amber-400/80 font-medium uppercase tracking-wider">升级 Pro</span>
          </div>
          <h2 className="text-neutral-100 font-semibold text-[15px] leading-snug mb-1.5">{copy.title}</h2>
          <p className="text-neutral-500 text-xs leading-relaxed">{copy.sub}</p>
        </div>

        {/* Plans */}
        <div className="px-5 pb-4 grid grid-cols-2 gap-2.5">
          {PLANS.map(plan => (
            <div
              key={plan.id}
              className={cn(
                'relative rounded-xl p-4 border flex flex-col gap-3',
                plan.highlight
                  ? 'bg-amber-500/8 border-amber-500/30'
                  : 'bg-neutral-800/40 border-neutral-700/60'
              )}
            >
              {plan.highlight && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] bg-amber-500 text-neutral-900 font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap">
                  {plan.tagline}
                </span>
              )}
              {!plan.highlight && (
                <span className="text-[10px] text-neutral-600 font-medium">{plan.tagline}</span>
              )}

              <div>
                <p className={cn('font-bold text-lg leading-none', plan.highlight ? 'text-amber-300' : 'text-neutral-200')}>
                  {plan.price}
                  <span className="text-xs font-normal text-neutral-500">{plan.period}</span>
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">{plan.calls} 次 Claude</p>
              </div>

              <ul className="space-y-1.5">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-1.5">
                    <Check size={10} className={cn('mt-0.5 shrink-0', plan.highlight ? 'text-amber-400' : 'text-neutral-600')} />
                    <span className="text-[11px] text-neutral-400 leading-snug">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={loading !== null}
                className={cn(
                  'w-full py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-60',
                  plan.highlight
                    ? 'bg-amber-500 text-neutral-900 hover:bg-amber-400'
                    : 'bg-neutral-700 text-neutral-200 hover:bg-neutral-600'
                )}
              >
                {loading === plan.id ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Zap size={11} className="animate-pulse" />跳转中…
                  </span>
                ) : (
                  `选择 ${plan.name} →`
                )}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="px-5 pb-3 text-xs text-red-400 break-all">{error}</p>
        )}

        {/* Footer */}
        <div className="px-5 pb-5 pt-2 border-t border-neutral-800">
          <p className="text-[10px] text-neutral-700 leading-relaxed text-center">
            MindWeaver AI is an independent platform. AI functionalities are powered by third-party APIs (Claude & DeepSeek).
            MindWeaver AI is not officially affiliated with, endorsed by, or sponsored by Anthropic or DeepSeek.
          </p>
        </div>
      </div>
    </div>
  )
}
