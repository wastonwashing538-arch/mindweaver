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

function BigDigit({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center justify-center font-mono font-bold text-xl tabular-nums
      w-12 h-12 rounded-lg
      text-amber-700 bg-amber-100 border-2 border-amber-300
      dark:text-amber-300 dark:bg-amber-400/10 dark:border-amber-400/30">
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
    fetch('/api/beta/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setRemaining(d.remaining); setIsBeta(d.userIsBeta) } })
      .catch(() => {})
    if (isLoggedIn) {
      fetch('/api/usage')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.quota?.tier && d.quota.tier !== 'free') setIsPaid(true) })
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

  return (
    <>
      <BetaRegistrationModal
        open={showReg}
        spotsLeft={remaining ?? 100}
        onClose={() => setShowReg(false)}
        onSuccess={() => { setClaimedLocally(true); setIsBeta(true) }}
      />

      {/* Card — takes up generous space in the sidebar */}
      <div className="mx-3 mb-2 shrink-0 rounded-2xl overflow-hidden border-2 shadow-lg
        bg-amber-50 border-amber-300
        dark:bg-amber-950/40 dark:border-amber-500/30 dark:shadow-amber-900/20">

        {/* Amber top accent bar */}
        <div className="h-1.5 bg-amber-500" />

        <div className="px-4 py-5 space-y-4">

          {/* Badge + timing */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest bg-amber-500 text-black px-3 py-1 rounded-full">
              内测
            </span>
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              限时 12h 活动
            </span>
          </div>

          {/* Main headline */}
          <div>
            <p className="text-xl font-bold leading-tight
              text-stone-900 dark:text-white">
              创始 VIP 名额
              <br />免费领取
            </p>
            <p className="text-sm mt-1.5 leading-snug
              text-neutral-600 dark:text-neutral-400">
              50 次 Claude 顶配通道独立额度
            </p>
            {remaining !== null && (
              <p className="text-sm font-bold mt-1
                text-amber-700 dark:text-amber-400">
                仅剩 {remaining} / 100 名额
              </p>
            )}
          </div>

          {/* Big countdown */}
          <div>
            <p className="text-xs font-semibold mb-2
              text-neutral-500 dark:text-neutral-500">
              距活动结束
            </p>
            <div className="flex items-center gap-2">
              <BigDigit value={pad(h)} />
              <span className="text-2xl font-black text-amber-500 select-none pb-1">:</span>
              <BigDigit value={pad(m)} />
              <span className="text-2xl font-black text-amber-500 select-none pb-1">:</span>
              <BigDigit value={pad(s)} />
            </div>
          </div>

          {/* CTA button */}
          {claimed ? (
            <div className="w-full py-3 rounded-xl text-center font-bold text-base
              text-emerald-700 bg-emerald-50 border-2 border-emerald-200
              dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800">
              ✓ 内测已激活
            </div>
          ) : (
            <button
              onClick={handleCta}
              className="w-full py-3 rounded-xl text-base font-bold
                bg-amber-500 text-black hover:bg-amber-400
                active:scale-[0.98] transition-all shadow-md shadow-amber-500/20"
            >
              {isLoggedIn ? '立即抢占名额 →' : '登录后抢占 →'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
