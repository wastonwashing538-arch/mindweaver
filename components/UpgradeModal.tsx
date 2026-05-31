'use client'

import { useState, useEffect } from 'react'
import { X, Zap, Check, Star, Clock, Gift } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BetaRegistrationModal } from './BetaRegistrationModal'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()
  const { isLoggedIn } = useAuth()
  const [betaStatus, setBetaStatus] = useState<{ remaining: number; userIsBeta: boolean } | null>(null)
  const [showRegModal, setShowRegModal] = useState(false)
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

  function handleClaimClick() {
    if (!isLoggedIn) {
      onClose()
      router.push('/auth?redirect=/')
      return
    }
    setShowRegModal(true)
  }

  function handleRegistrationSuccess() {
    setClaimed(true)
    onBetaClaimed?.()
  }

  return (
    <>
      <BetaRegistrationModal
        open={showRegModal}
        spotsLeft={remaining}
        onClose={() => setShowRegModal(false)}
        onSuccess={handleRegistrationSuccess}
      />
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
          /* ── Success ── */
          <div className="px-6 py-10 flex flex-col items-center text-center gap-4">
            <div className="text-4xl">🎉</div>
            <h2 className="text-white font-black text-lg">内测额度已到账！</h2>
            <p className="text-neutral-400 text-sm">50 次 Claude 高速调用已激活，页面即将刷新…</p>
            <div className="flex items-center gap-2 text-amber-400/60 text-xs">
              <Zap size={12} className="animate-pulse" />正在激活…
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-gradient-to-b from-black to-neutral-950 px-5 pt-5 pb-4 border-b border-amber-500/20">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-500 text-black flex items-center gap-1">
                  🔥 内测阶段
                </span>
                <span className="text-[10px] text-neutral-500">支付网关审核期间专属</span>
              </div>
              <h2 className="text-white font-black text-base leading-snug mb-1">
                创始团队限时内测特惠开启！
              </h2>
              <p className="text-neutral-400 text-xs leading-relaxed">
                {subtitle}
              </p>
            </div>

            {/* Body — exact copy from spec */}
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-neutral-300 leading-relaxed">
                由于海外 Creem 支付网关正在进行最后的人工合规审计，我们决定将首批{' '}
                <span className="text-white font-black">100 个 VIP 席位</span>{' '}
                免费赠送给社区技术流。
              </p>

              <ul className="space-y-2.5">
                <li className="flex items-start gap-2.5">
                  <Gift size={14} className="text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-neutral-200">
                    立刻到账 <span className="text-white font-black">50 次</span> 顶配 Claude 高速独立通道额度
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Zap size={14} className="text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-neutral-200">
                    享有正式上线后首月订阅{' '}
                    <span className="text-amber-400 font-black">半价特权优惠券</span>
                  </span>
                </li>
              </ul>

              {/* Progress */}
              <div className="bg-black/60 rounded-xl p-3 border border-neutral-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-neutral-400">名额进度</span>
                  <span className={cn('text-[11px] font-black', isFull ? 'text-red-400' : remaining <= 20 ? 'text-red-400' : 'text-amber-300')}>
                    {isFull ? '已满员' : `剩余 ${remaining}/100`}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-neutral-800 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-700"
                    style={{ width: `${Math.max(pct, 2)}%` }} />
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="px-5 pb-5 space-y-2">
              {alreadyBeta ? (
                <div className="w-full py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <span className="text-emerald-400 text-sm font-black">✓ 你已是内测用户</span>
                </div>
              ) : isFull ? (
                <div className="w-full py-3 rounded-xl bg-neutral-800 text-center">
                  <span className="text-neutral-500 text-sm">名额已满 · 关注 Twitter 等候正式上线</span>
                </div>
              ) : (
                <button
                  onClick={handleClaimClick}
                  className="w-full py-3.5 rounded-xl bg-amber-500 text-black text-sm font-black hover:bg-amber-400 active:scale-[0.98] transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                >
                  🛑 立即一键抢占内测名额（剩余 {remaining}/{BETA_TOTAL}）
                </button>
              )}

              <p className="text-center text-[10px] text-neutral-700 leading-relaxed">
                MindWeaver AI is independent. Powered by third-party APIs (Claude & DeepSeek). Not affiliated with Anthropic or DeepSeek.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}
