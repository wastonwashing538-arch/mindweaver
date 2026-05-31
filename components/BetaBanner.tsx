'use client'

import { useState, useEffect } from 'react'
import { X, Zap } from 'lucide-react'
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

function DigitBox({ value }: { value: string }) {
  return (
    <span className="inline-block font-mono font-black text-sm text-amber-400 bg-amber-400/[0.08] border border-amber-400/20 rounded px-1.5 py-0.5 leading-none tabular-nums min-w-[1.75rem] text-center">
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

      {/* ── Banner ─────────────────────────────────────────────────────────── */}
      <div className="relative shrink-0 bg-neutral-950 border-b border-white/[0.06] overflow-hidden">

        {/* Single amber top rule — the only decorative element */}
        <div className="absolute top-0 inset-x-0 h-px bg-amber-500/70" />

        {/* ── Desktop layout (single row) ── */}
        <div className="hidden sm:flex items-center gap-4 px-5 py-3">

          {/* Badge */}
          <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.12em] bg-amber-500 text-black px-2.5 py-[3px] rounded-sm">
            内测
          </span>

          {/* Headline */}
          <p className="shrink-0 text-sm font-bold text-white leading-none">
            创始内测名额免费开放
          </p>

          {/* Divider */}
          <span className="text-white/15 select-none">|</span>

          {/* Subtitle + spots */}
          <p className="flex-1 text-sm text-white/45 leading-none">
            50 次 Claude 顶配通道独立额度
            {remaining !== null && (
              <>
                <span className="mx-2 text-white/15">·</span>
                <span className="text-amber-400 font-semibold">
                  仅剩 {remaining}/100 名额
                </span>
              </>
            )}
          </p>

          {/* Countdown */}
          <div className="shrink-0 flex items-center gap-1">
            <DigitBox value={pad(h)} />
            <span className="text-amber-400/40 font-black text-xs select-none">:</span>
            <DigitBox value={pad(m)} />
            <span className="text-amber-400/40 font-black text-xs select-none">:</span>
            <DigitBox value={pad(s)} />
          </div>

          {/* CTA */}
          {isClaimed ? (
            <span className="shrink-0 text-xs font-bold text-emerald-400 tracking-wide">
              ✓ 已激活
            </span>
          ) : (
            <button
              onClick={handleCta}
              className="shrink-0 text-[11px] font-black bg-amber-500 text-black px-4 py-2 rounded hover:bg-amber-400 active:scale-[0.97] transition-all whitespace-nowrap"
            >
              {isLoggedIn ? '立即领取 →' : '登录后领取 →'}
            </button>
          )}

          {/* Dismiss */}
          <button
            onClick={dismiss}
            aria-label="关闭活动通知"
            className="shrink-0 w-6 h-6 flex items-center justify-center text-white/20 hover:text-white/60 transition-colors rounded"
          >
            <X size={13} />
          </button>
        </div>

        {/* ── Mobile layout (two rows) ── */}
        <div className="sm:hidden px-4 py-2.5 space-y-2">

          {/* Row 1: badge + headline + dismiss */}
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.12em] bg-amber-500 text-black px-2 py-[2px] rounded-sm">
              内测
            </span>
            <p className="flex-1 text-xs font-bold text-white leading-none">
              创始内测名额免费开放 — 50 次 Claude 额度
            </p>
            <button onClick={dismiss} className="shrink-0 text-white/20 hover:text-white/60 transition-colors">
              <X size={13} />
            </button>
          </div>

          {/* Row 2: spots + countdown + CTA */}
          <div className="flex items-center gap-2.5">
            {remaining !== null && (
              <span className="text-[11px] text-amber-400 font-semibold">
                剩 {remaining}/100
              </span>
            )}
            <div className="flex items-center gap-0.5 flex-1">
              <DigitBox value={pad(h)} />
              <span className="text-amber-400/40 font-black text-[10px] px-0.5">:</span>
              <DigitBox value={pad(m)} />
              <span className="text-amber-400/40 font-black text-[10px] px-0.5">:</span>
              <DigitBox value={pad(s)} />
            </div>
            {isClaimed ? (
              <span className="text-[11px] font-bold text-emerald-400">✓ 已激活</span>
            ) : (
              <button
                onClick={handleCta}
                className="text-[11px] font-black bg-amber-500 text-black px-3.5 py-1.5 rounded active:scale-95 transition-transform whitespace-nowrap"
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
