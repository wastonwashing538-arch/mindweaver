'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { BetaRegistrationModal } from './BetaRegistrationModal'

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

function Digit({ value }: { value: string }) {
  return (
    <span className="inline-block font-mono font-black text-[11px] tabular-nums min-w-[1.4rem] text-center
      text-amber-700 bg-amber-100 border border-amber-200 rounded
      dark:text-amber-400 dark:bg-amber-400/10 dark:border-amber-400/20
      px-1 py-[1px] leading-none">
      {value}
    </span>
  )
}

export function SidebarBetaCard() {
  const router = useRouter()
  const { isLoggedIn } = useAuth()
  const { h, m, s, expired } = useCountdown()

  const [remaining, setRemaining] = useState<number | null>(null)
  const [isBeta, setIsBeta] = useState(false)
  const [isPaid, setIsPaid] = useState(false)
  const [showReg, setShowReg] = useState(false)
  const [claimedLocally, setClaimedLocally] = useState(false)

  useEffect(() => {
    if (expired) return
    // Fetch beta status
    fetch('/api/beta/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setRemaining(d.remaining); setIsBeta(d.userIsBeta) } })
      .catch(() => {})
    // Fetch user tier
    if (isLoggedIn) {
      fetch('/api/usage')
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.quota?.tier && d.quota.tier !== 'free') setIsPaid(true)
        })
        .catch(() => {})
    }
  }, [expired, isLoggedIn])

  const claimed = isBeta || claimedLocally
  const isFull = remaining !== null && remaining <= 0

  if (expired || isPaid) return null
  if (isFull && !claimed) return null

  function handleCta() {
    if (!isLoggedIn) { router.push('/auth?redirect=/'); return }
    setShowReg(true)
  }

  function handleSuccess() {
    setClaimedLocally(true)
    setIsBeta(true)
  }

  return (
    <>
      <BetaRegistrationModal
        open={showReg}
        spotsLeft={remaining ?? 100}
        onClose={() => setShowReg(false)}
        onSuccess={handleSuccess}
      />

      <div className="mx-3 mb-1 shrink-0 rounded-xl overflow-hidden border
        bg-amber-50 border-amber-200/70
        dark:bg-amber-950/25 dark:border-amber-500/15">

        {/* Top amber line */}
        <div className="h-[2px] bg-amber-500/80" />

        <div className="px-3 py-2.5 space-y-2">

          {/* Badge + label */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-wider bg-amber-500 text-black px-1.5 py-[2px] rounded-sm">
              内测
            </span>
            <span className="text-[10px] text-neutral-500 dark:text-neutral-500">
              限时 12h 活动
            </span>
          </div>

          {/* Headline */}
          <div>
            <p className="text-xs font-black leading-tight
              text-neutral-900 dark:text-neutral-100">
              创始 VIP 名额免费领
            </p>
            <p className="text-[10px] mt-0.5 leading-tight
              text-neutral-500 dark:text-neutral-500">
              50次 Claude 顶配通道
              {remaining !== null && (
                <span className="text-amber-700 dark:text-amber-400 font-semibold ml-1">
                  · 剩 {remaining}/100
                </span>
              )}
            </p>
          </div>

          {/* Countdown */}
          <div className="flex items-center gap-0.5">
            <Digit value={pad(h)} />
            <span className="text-[9px] font-black text-amber-500/50 px-0.5">:</span>
            <Digit value={pad(m)} />
            <span className="text-[9px] font-black text-amber-500/50 px-0.5">:</span>
            <Digit value={pad(s)} />
          </div>

          {/* CTA */}
          {claimed ? (
            <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">✓ 内测已激活</p>
          ) : (
            <button
              onClick={handleCta}
              className="w-full text-[11px] font-black py-1.5 rounded-lg
                bg-amber-500 text-black hover:bg-amber-400
                active:scale-95 transition-all"
            >
              {isLoggedIn ? '立即抢占 →' : '登录后抢占 →'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
