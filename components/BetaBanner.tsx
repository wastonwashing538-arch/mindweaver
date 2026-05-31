'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { BetaRegistrationModal } from './BetaRegistrationModal'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'

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

// Digit box — dark text on light bg, amber text on dark bg
function DigitBox({ value }: { value: string }) {
  return (
    <span className="inline-block font-mono font-black text-sm
      text-amber-700 bg-amber-100 border border-amber-300
      dark:text-amber-400 dark:bg-amber-400/[0.08] dark:border-amber-400/20
      rounded px-1.5 py-0.5 leading-none tabular-nums min-w-[1.75rem] text-center">
      {value}
    </span>
  )
}

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
  const [alreadyClaimed, setAlreadyClaimed] = useState(false)
  const [showRegModal, setShowRegModal] = useState(false)
  const [claimedLocally, setClaimedLocally] = useState(false)

  useEffect(() => {
    try { if (localStorage.getItem('mw-beta-dismissed-v2')) setDismissed(true) } catch {}
  }, [])

  useEffect(() => {
    if (dismissed || expired) return
    fetch('/api/beta/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        setRemaining(d.remaining)
        setAlreadyClaimed(d.userIsBeta)
      })
      .catch(() => {})
  }, [dismissed, expired])

  const isPaid = userTier !== 'free' && userTier !== 'guest'
  const isClaimed = alreadyClaimed || claimedLocally || userTier === 'beta_vip'
  const isFull = remaining !== null && remaining <= 0

  if (dismissed || expired || isPaid) return null
  if (isFull && !isClaimed) return null

  function handleCta() {
    if (!isLoggedIn) { router.push('/auth?redirect=/'); return }
    setShowRegModal(true)
  }

  function dismiss() {
    try { localStorage.setItem('mw-beta-dismissed-v2', '1') } catch {}
    setDismissed(true)
  }

  function handleSuccess() {
    setClaimedLocally(true)
    setAlreadyClaimed(true)
    onClaimed()
  }

  return (
    <>
      <BetaRegistrationModal
        open={showRegModal}
        spotsLeft={remaining ?? 100}
        onClose={() => setShowRegModal(false)}
        onSuccess={handleSuccess}
      />

      {/* ── Banner ── */}
      <div className="relative shrink-0 overflow-hidden
        bg-amber-50 border-b border-amber-200/80
        dark:bg-neutral-950 dark:border-white/[0.06]">

        {/* Amber top rule */}
        <div className="absolute top-0 inset-x-0 h-px
          bg-amber-500
          dark:bg-amber-500/70" />

        {/* ── Desktop (single row) ── */}
        <div className="hidden sm:flex items-center gap-4 px-5 py-3">

          {/* Badge */}
          <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.12em]
            bg-amber-500 text-black px-2.5 py-[3px] rounded-sm">
            内测
          </span>

          {/* Headline */}
          <p className="shrink-0 text-sm font-black leading-none tracking-tight
            text-neutral-900 dark:text-white">
            创始内测名额免费开放
          </p>

          {/* Divider */}
          <span className="text-neutral-300 dark:text-white/15 select-none">|</span>

          {/* Subtitle + spots */}
          <p className="flex-1 text-sm leading-none
            text-neutral-600 dark:text-white/50">
            50 次 Claude 顶配通道独立额度
            {remaining !== null && (
              <>
                <span className="mx-2 text-neutral-300 dark:text-white/15">·</span>
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  仅剩 {remaining}/100 名额
                </span>
              </>
            )}
          </p>

          {/* Countdown */}
          <div className="shrink-0 flex items-center gap-1">
            <DigitBox value={pad(h)} />
            <span className="font-black text-xs select-none
              text-amber-500/60 dark:text-amber-400/40">:</span>
            <DigitBox value={pad(m)} />
            <span className="font-black text-xs select-none
              text-amber-500/60 dark:text-amber-400/40">:</span>
            <DigitBox value={pad(s)} />
          </div>

          {/* CTA */}
          {isClaimed ? (
            <span className="shrink-0 text-xs font-bold tracking-wide
              text-emerald-700 dark:text-emerald-400">
              ✓ 已激活
            </span>
          ) : (
            <button
              onClick={handleCta}
              className="shrink-0 text-[11px] font-black px-4 py-2 rounded
                bg-amber-500 text-black hover:bg-amber-400
                active:scale-[0.97] transition-all whitespace-nowrap"
            >
              {isLoggedIn ? '立即领取 →' : '登录后领取 →'}
            </button>
          )}

          {/* Dismiss */}
          <button
            onClick={dismiss}
            aria-label="关闭活动通知"
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors
              text-neutral-400 hover:text-neutral-700
              dark:text-white/20 dark:hover:text-white/60"
          >
            <X size={13} />
          </button>
        </div>

        {/* ── Mobile (two rows) ── */}
        <div className="sm:hidden px-4 py-2.5 space-y-2">

          {/* Row 1: badge + headline + dismiss */}
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.12em]
              bg-amber-500 text-black px-2 py-[2px] rounded-sm">
              内测
            </span>
            <p className="flex-1 text-xs font-black leading-none
              text-neutral-900 dark:text-white">
              创始内测名额免费开放 — 50 次 Claude 额度
            </p>
            <button
              onClick={dismiss}
              className="shrink-0 transition-colors
                text-neutral-400 hover:text-neutral-700
                dark:text-white/20 dark:hover:text-white/60"
            >
              <X size={13} />
            </button>
          </div>

          {/* Row 2: spots + countdown + CTA */}
          <div className="flex items-center gap-2.5">
            {remaining !== null && (
              <span className="text-[11px] font-semibold
                text-amber-700 dark:text-amber-400">
                剩 {remaining}/100
              </span>
            )}
            <div className="flex items-center gap-0.5 flex-1">
              <DigitBox value={pad(h)} />
              <span className="font-black text-[10px] px-0.5
                text-amber-500/60 dark:text-amber-400/40">:</span>
              <DigitBox value={pad(m)} />
              <span className="font-black text-[10px] px-0.5
                text-amber-500/60 dark:text-amber-400/40">:</span>
              <DigitBox value={pad(s)} />
            </div>
            {isClaimed ? (
              <span className="text-[11px] font-bold
                text-emerald-700 dark:text-emerald-400">✓ 已激活</span>
            ) : (
              <button
                onClick={handleCta}
                className="text-[11px] font-black px-3.5 py-1.5 rounded
                  bg-amber-500 text-black active:scale-95 transition-transform whitespace-nowrap"
              >
                {isLoggedIn ? '立即领取 →' : '登录领取 →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
