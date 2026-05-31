'use client'

import { useState, useEffect } from 'react'
import { X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

// Deadline: today at 4pm + 12h = tomorrow 4am (local time)
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
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  return { h, m, s, expired: ms <= 0 }
}

function pad(n: number) { return String(n).padStart(2, '0') }

interface BetaBannerProps {
  userTier: string
  onClaimed: () => void
}

export function BetaBanner({ userTier, onClaimed }: BetaBannerProps) {
  const { h, m, s, expired } = useCountdown()
  const [dismissed, setDismissed] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [userIsBeta, setUserIsBeta] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [success, setSuccess] = useState(false)

  // Check localStorage dismissal
  useEffect(() => {
    try { if (localStorage.getItem('mw-beta-dismissed-v1')) setDismissed(true) } catch {}
  }, [])

  // Fetch beta status
  useEffect(() => {
    if (dismissed || expired) return
    fetch('/api/beta/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        setRemaining(d.remaining)
        setUserIsBeta(d.userIsBeta)
      })
      .catch(() => {})
  }, [dismissed, expired])

  const isPaid = userTier !== 'free' && userTier !== 'guest'
  const alreadyClaimed = userIsBeta || success || userTier === 'beta_vip'

  // Hide conditions
  if (dismissed || expired || isPaid) return null
  if (remaining !== null && remaining <= 0 && !alreadyClaimed) return null

  async function handleClaim() {
    setClaiming(true)
    try {
      const res = await fetch('/api/beta/claim', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setSuccess(true)
        setUserIsBeta(true)
        onClaimed()
        setTimeout(() => window.location.reload(), 2500)
      }
    } catch {}
    setClaiming(false)
  }

  function dismiss() {
    try { localStorage.setItem('mw-beta-dismissed-v1', '1') } catch {}
    setDismissed(true)
  }

  return (
    <div className={cn(
      'shrink-0 relative border-b border-amber-500/25',
      'bg-gradient-to-r from-neutral-900 via-amber-950/30 to-neutral-900',
    )}>
      {success ? (
        /* ── Success strip ── */
        <div className="flex items-center justify-center gap-2 px-4 py-2.5">
          <Zap size={13} className="text-amber-400 animate-pulse" />
          <span className="text-xs font-semibold text-amber-300">
            🎉 内测名额已到账！50 次 Claude 4.6 调用已激活，正在刷新…
          </span>
        </div>
      ) : (
        /* ── Activity strip ── */
        <div className="flex items-center gap-3 px-3 md:px-4 py-2 min-h-[44px]">

          {/* Left: badge + headline */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400">
              ⚡ 内测阶段
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-200 leading-tight truncate">
              <span className="text-amber-400">限时 12h · </span>
              创始内测：前 100 名免费获得 Claude Sonnet 4.6 顶配通道
            </p>
            <p className="text-[10px] text-neutral-500 leading-tight mt-0.5 hidden sm:block">
              支付网关审核期间，内测名额完全免费 · 获赠 50 次高速调用
            </p>
          </div>

          {/* Countdown */}
          <div className="shrink-0 flex items-center gap-1 font-mono text-xs font-semibold text-amber-300 bg-amber-950/40 border border-amber-500/20 rounded-lg px-2.5 py-1 select-none">
            <span className="hidden sm:inline text-amber-500/60 text-[10px] mr-0.5">剩</span>
            <span>{pad(h)}</span>
            <span className="text-amber-500/60 animate-pulse">:</span>
            <span>{pad(m)}</span>
            <span className="text-amber-500/60 animate-pulse">:</span>
            <span>{pad(s)}</span>
          </div>

          {/* Remaining spots */}
          {remaining !== null && (
            <div className="shrink-0 hidden md:flex items-center gap-1 text-[10px] text-neutral-500">
              <span className={cn('font-bold', remaining <= 20 ? 'text-red-400' : 'text-emerald-400')}>
                {remaining}
              </span>
              <span>/100 名额</span>
            </div>
          )}

          {/* CTA */}
          {alreadyClaimed ? (
            <span className="shrink-0 text-[11px] text-emerald-400 font-semibold px-2">✓ 已激活</span>
          ) : (
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-neutral-900 text-[11px] font-black hover:bg-amber-400 active:scale-95 transition-all disabled:opacity-60 whitespace-nowrap"
            >
              {claiming ? <><Zap size={10} className="animate-pulse" />抢占中</> : <>⚡ 一键抢占</>}
            </button>
          )}

          {/* Dismiss */}
          <button
            onClick={dismiss}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-neutral-600 hover:text-neutral-400 hover:bg-neutral-800 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
