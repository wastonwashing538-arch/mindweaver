'use client'

import { useState, useEffect } from 'react'
import { X, Zap, Check, Star, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UpgradeModalProps {
  open: boolean
  onClose: () => void
  reason?: 'daily_limit' | 'preset_requires_paid' | 'monthly_limit'
  onBetaClaimed?: () => void
}

const BETA_TOTAL = 100
const BETA_PERKS = [
  '50次 Claude Sonnet 4.6 顶配调用',
  '智能合约审计 & 链上脚本专家模式',
  '树状分支对话，深度思考不断路',
  '完全免费，无需任何付款',
  '正式上线后享创始用户折扣续费',
]

const REASON_SUBTITLE: Record<string, string> = {
  daily_limit: '今日 50 次 DeepSeek 免费额度已耗尽 —— 现在抢内测名额，立即获得 Claude 高速通道。',
  preset_requires_paid: '智能合约审计 & 链上脚本模式需要 Claude 4.6 —— 抢名额后立即解锁。',
  monthly_limit: '本月额度已用完 —— 申请内测名额，重新获得 Claude 调用权限。',
  default: '支付网关审核期间，我们向前 100 名创始用户限时开放内测 VIP 名额。',
}

export function UpgradeModal({ open, onClose, reason, onBetaClaimed }: UpgradeModalProps) {
  const [betaStatus, setBetaStatus] = useState<{ remaining: number; userIsBeta: boolean } | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    fetch('/api/beta/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setBetaStatus({ remaining: d.remaining, userIsBeta: d.userIsBeta }) })
      .catch(() => {})
  }, [open])

  if (!open) return null

  const subtitle = REASON_SUBTITLE[reason ?? 'default'] ?? REASON_SUBTITLE.default
  const remaining = betaStatus?.remaining ?? BETA_TOTAL
  const isFull = remaining <= 0
  const alreadyBeta = betaStatus?.userIsBeta || claimed
  const pct = Math.round(((BETA_TOTAL - remaining) / BETA_TOTAL) * 100)

  async function handleClaim() {
    setClaiming(true)
    setError(null)
    try {
      const res = await fetch('/api/beta/claim', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setClaimed(true)
        onBetaClaimed?.()
        // Reload page after 2s to refresh tier state
        setTimeout(() => window.location.reload(), 2000)
      } else if (data.error === 'Unauthorized') {
        setError('请先登录再申请内测名额。')
      } else if (data.error === 'BETA_FULL') {
        setError('100 个名额已全部抢光！关注我们的 Twitter 等候正式上线。')
        setBetaStatus(prev => prev ? { ...prev, remaining: 0 } : null)
      } else {
        setError(data.message ?? '申请失败，请重试。')
      }
    } catch {
      setError('网络错误，请重试。')
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"
      onClick={!claimed ? onClose : undefined}
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      <div
        className="relative z-10 w-full max-w-sm bg-neutral-900 border border-amber-500/20 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        {!claimed && (
          <button onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors z-10">
            <X size={14} />
          </button>
        )}

        {claimed ? (
          /* ── Success state ── */
          <div className="px-6 py-10 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center">
              <Star size={24} className="text-amber-400 fill-amber-400/30" />
            </div>
            <div>
              <h2 className="text-neutral-100 font-semibold text-base mb-1.5">🎉 内测额度已到账！</h2>
              <p className="text-neutral-400 text-sm leading-relaxed">
                50 次 Claude Sonnet 4.6 已添加到你的账户。<br />
                页面即将刷新，请稍候…
              </p>
            </div>
            <div className="flex items-center gap-2 text-amber-400/60 text-xs">
              <Zap size={12} className="animate-pulse" />
              正在激活…
            </div>
          </div>
        ) : (
          /* ── Claim state ── */
          <>
            {/* Header */}
            <div className="relative px-5 pt-6 pb-4">
              {/* Badge */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={9} />
                  限时 48 小时
                </span>
                <span className="text-[10px] text-neutral-600">支付网关审核期间专属</span>
              </div>

              <h2 className="text-neutral-100 font-semibold text-[15px] leading-snug mb-1.5">
                MindWeaver 创始团队内测特招
              </h2>
              <p className="text-neutral-500 text-xs leading-relaxed">{subtitle}</p>
            </div>

            {/* Spots progress */}
            <div className="px-5 pb-4">
              <div className="bg-neutral-800/60 rounded-xl p-3.5 border border-neutral-700/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-neutral-400 font-medium">内测名额进度</span>
                  <span className={cn(
                    'text-xs font-semibold',
                    isFull ? 'text-red-400' : remaining <= 20 ? 'text-amber-400' : 'text-emerald-400'
                  )}>
                    {isFull ? '已满员' : `仅剩 ${remaining} 个`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-neutral-700 overflow-hidden mb-1.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-700"
                    style={{ width: `${Math.max(pct, 3)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-neutral-600">
                  <span>已抢 {BETA_TOTAL - remaining}/{BETA_TOTAL}</span>
                  <span>100 名额上限</span>
                </div>
              </div>
            </div>

            {/* Perks */}
            <div className="px-5 pb-4">
              <p className="text-[11px] text-neutral-500 font-medium mb-2">内测 VIP 包含：</p>
              <ul className="space-y-1.5">
                {BETA_PERKS.map(p => (
                  <li key={p} className="flex items-start gap-2">
                    <Check size={11} className="text-amber-400 mt-0.5 shrink-0" />
                    <span className="text-xs text-neutral-300 leading-snug">{p}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA */}
            <div className="px-5 pb-6 space-y-2">
              {error && <p className="text-xs text-red-400 text-center break-all">{error}</p>}

              {alreadyBeta ? (
                <div className="w-full py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <span className="text-emerald-400 text-sm font-medium">✓ 你已是内测用户</span>
                </div>
              ) : isFull ? (
                <div className="w-full py-3 rounded-xl bg-neutral-800 text-center">
                  <span className="text-neutral-500 text-sm">名额已满 · 关注 Twitter 等候正式上线</span>
                </div>
              ) : (
                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="w-full py-3 rounded-xl bg-amber-500 text-neutral-900 text-sm font-bold hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {claiming ? (
                    <><Zap size={14} className="animate-pulse" />申请中…</>
                  ) : (
                    <>⚡️ 一键抢占内测名额</>
                  )}
                </button>
              )}

              <p className="text-center text-[10px] text-neutral-700 leading-relaxed">
                MindWeaver AI is an independent platform. AI functionalities are powered by third-party APIs (Claude & DeepSeek).
                Not affiliated with Anthropic or DeepSeek.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
