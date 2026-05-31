'use client'

import { useState, useEffect } from 'react'
import { X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BetaRegistrationModal } from './BetaRegistrationModal'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'

// Deadline: today at 4pm local + 12h = tomorrow 4am
function buildDeadline() {
  const d = new Date()
  d.setHours(16, 0, 0, 0)
  d.setTime(d.getTime() + 12 * 60 * 60 * 1000)
  return d
}
const DEADLINE = buildDeadline()

function useCountdown() {
  const [ms, setMs] = useState(() => Math.max(0, DEADLINE.getTime() - Date.now()))
  useEffect(() => {
    const id = setInterval(() => setMs(Math.max(0, DEADLINE.getTime() - Date.now())), 1000)
    return () => clearInterval(id)
  }, [])
  return {
    h: Math.floor(ms / 3_600_000),
    m: Math.floor((ms % 3_600_000) / 60_000),
    s: Math.floor((ms % 60_000) / 1_000),
    expired: ms <= 0,
  }
}

function pad(n: number) { return String(n).padStart(2, '0') }

interface BetaBannerProps {
  userTier: string
  onClaimed: () => void
}

export function BetaBanner({ userTier, onClaimed }: BetaBannerProps) {
  const router = useRouter()
  const { isLoggedIn } = useAuth()
  const { h, m, s, expired } = useCountdown()

  const [dismissed, setDismissed] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [userIsBeta, setUserIsBeta] = useState(false)
  const [showRegModal, setShowRegModal] = useState(false)
  const [claimedLocally, setClaimedLocally] = useState(false)

  useEffect(() => {
    try { if (localStorage.getItem('mw-beta-dismissed-v2')) setDismissed(true) } catch {}
  }, [])

  useEffect(() => {
    if (dismissed || expired) return
    fetch('/api/beta/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setRemaining(d.remaining); setUserIsBeta(d.userIsBeta) } })
      .catch(() => {})
  }, [dismissed, expired])

  const isPaid = userTier !== 'free' && userTier !== 'guest'
  const alreadyClaimed = userIsBeta || claimedLocally || userTier === 'beta_vip'
  const isFull = remaining !== null && remaining <= 0

  if (dismissed || expired || isPaid) return null
  if (isFull && !alreadyClaimed) return null

  function handleCtaClick() {
    if (!isLoggedIn) {
      router.push('/auth?redirect=/')
      return
    }
    setShowRegModal(true)
  }

  function handleDismiss() {
    try { localStorage.setItem('mw-beta-dismissed-v2', '1') } catch {}
    setDismissed(true)
  }

  function handleClaimed() {
    setClaimedLocally(true)
    setUserIsBeta(true)
    onClaimed()
  }

  return (
    <>
      <BetaRegistrationModal
        open={showRegModal}
        spotsLeft={remaining ?? 100}
        onClose={() => setShowRegModal(false)}
        onSuccess={handleClaimed}
      />

      <div className={cn(
        'shrink-0 relative',
        'bg-gradient-to-r from-black via-neutral-950 to-black',
        'border-b-2 border-amber-500/40',
      )}>
        {/* Subtle amber top line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />

        <div className="px-3 md:px-5 py-3 md:py-4">

          {/* Top row: badge + countdown */}
          <div className="flex items-center justify-between mb-2 md:mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] md:text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-500 text-black">
                ⚡ 内测阶段
              </span>
              <span className="text-[10px] md:text-xs text-amber-500/70 font-semibold hidden sm:inline">
                支付网关审核期间 · 限时 12h 免费特招
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Countdown */}
              <div className="flex items-center gap-1 font-mono font-black text-sm md:text-base text-amber-300 bg-black/60 border border-amber-500/30 rounded-lg px-2.5 py-1">
                <span>{pad(h)}</span>
                <span className="text-amber-500/50 animate-pulse text-xs">:</span>
                <span>{pad(m)}</span>
                <span className="text-amber-500/50 animate-pulse text-xs">:</span>
                <span>{pad(s)}</span>
              </div>

              <button onClick={handleDismiss} className="w-6 h-6 flex items-center justify-center rounded-full text-neutral-600 hover:text-neutral-400 hover:bg-neutral-800 transition-colors">
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Main content row */}
          <div className="flex items-center gap-3 md:gap-4">

            {/* Headline block */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm md:text-base font-black text-white leading-tight">
                🔥 创始团队限时内测特惠开启！前 100 名免费获赠顶配 Claude 独立通道
              </h3>
              <p className="text-xs md:text-sm text-neutral-400 mt-0.5 leading-snug">
                由于 Creem 支付网关正在合规审计，我们决定将首批{' '}
                <span className="text-amber-400 font-black">100 个 VIP 席位</span>{' '}
                免费赠送给社区技术流。抢到即享{' '}
                <span className="text-white font-black">50 次 Claude 高速调用</span>{' '}
                + 正式上线首月半价优惠券。
              </p>
            </div>

            {/* Right: spots + CTA */}
            <div className="shrink-0 flex flex-col items-end gap-2">
              {remaining !== null && (
                <div className="text-right">
                  <span className={cn(
                    'text-lg md:text-xl font-black',
                    remaining <= 20 ? 'text-red-400' : 'text-amber-300'
                  )}>
                    {remaining}
                  </span>
                  <span className="text-xs text-neutral-500 font-semibold"> / 100 名额</span>
                </div>
              )}

              {alreadyClaimed ? (
                <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black">
                  ✓ 内测已激活
                </div>
              ) : (
                <button
                  onClick={handleCtaClick}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 text-black text-xs md:text-sm font-black hover:bg-amber-400 active:scale-95 transition-all whitespace-nowrap shadow-lg shadow-amber-500/20"
                >
                  <Zap size={12} className="shrink-0" />
                  {isLoggedIn ? '一键抢占名额' : '登录后抢占'}
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
