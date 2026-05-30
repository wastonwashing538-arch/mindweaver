'use client'

import { useRef, useEffect, useState, KeyboardEvent } from 'react'
import { ArrowUp, GitBranch, Menu } from 'lucide-react'
import { useBranch, buildContext } from '@/lib/branch-context'
import { useConversation } from '@/lib/conversation-context'
import { useAuth } from '@/lib/auth-context'
import { Branch, Message } from '@/lib/types'
import { MessageBubble } from './MessageBubble'
import { GuestLimitModal } from './GuestLimitModal'
import { UpgradeModal } from './UpgradeModal'
import { cn } from '@/lib/utils'
import { posthog } from '@/lib/posthog'

// ── Three independent text pools ──────────────────────────────────────────

// Hero: user-first, warm, time-aware greetings
function pickHeroTitle(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return pick([
    '早上好，今天想从哪里开始？',
    '早安，有什么想法冒出来了？',
    '新的一天，有什么值得深想？',
    '早上好，有什么在脑子里转？',
  ])
  if (h >= 12 && h < 18) return pick([
    '下午好，有什么值得深想的？',
    '午后，来聊点什么吧。',
    '下午好，有什么困扰着你？',
    '今天，想把什么想清楚？',
  ])
  if (h >= 18 && h < 23) return pick([
    '晚上好，今天有什么收获？',
    '傍晚了，有什么想法还没理清？',
    '晚上好，今天遇到什么有意思的事？',
    '夜里，来聊点什么吧。',
  ])
  return pick([
    '夜深了，有什么还没想清楚？',
    '深夜，把脑子里的事聊聊吧。',
    '还没睡呀，有什么在心里转？',
  ])
}

// Subtitles: product positioning
const SUBTITLES = [
  '分支对话，让每个方向都走得更深。',
  '思维是树状的，这里是它生长的地方。',
  '一个想法，可以同时朝多个方向延伸。',
  '不只是聊天，是把思路梳理成型。',
  '对话即思考，结构即洞见。',
  '每次分叉，都是一次更深的探索。',
  '在这里，你的每个想法都有空间展开。',
  '把混沌的直觉，长成清晰的脉络。',
]

// Placeholders: action-oriented, conversational
const PLACEHOLDERS = [
  '你最近在思考什么难题？',
  '把一个困扰你的问题丢进来……',
  '今天想把哪个想法想透？',
  '有什么事情越想越乱？说来听听……',
  '一个你反复想起的问题……',
  '随便一个想法，开始探索……',
  '什么事情让你想停下来细想？',
  '有什么直觉，但还说不清楚？',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── Tier-based model badge (read-only, no user selection) ────────────────────

function TierModelBadge({
  userTier,
  onUpgradeClick,
}: {
  userTier: 'free' | 'vip' | 'guest'
  onUpgradeClick: () => void
}) {
  const isVip = userTier === 'vip'
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[11px] px-2.5 py-1 rounded-full border border-neutral-800 text-neutral-600 select-none">
        {isVip ? '✦ Claude 4.5 Sonnet' : 'DeepSeek R1'}
      </span>
      {!isVip && (
        <button
          onClick={onUpgradeClick}
          className="text-[11px] text-amber-500/60 hover:text-amber-400 transition-colors"
        >
          升级 Pro 解锁 Claude →
        </button>
      )}
    </div>
  )
}

interface ChatAreaProps {
  onMenuClick: () => void
}

export function ChatArea({ onMenuClick }: ChatAreaProps) {
  const { state, dispatch } = useBranch()
  const { activeConvId, updateTitle } = useConversation()
  const { isLoggedIn } = useAuth()
  const [input, setInput] = useState('')
  const [streamingBranchId, setStreamingBranchId] = useState<string | null>(null)
  const [animatingOut, setAnimatingOut] = useState(false)
  const [showEnterAnims, setShowEnterAnims] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const heroInputRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isComposingRef = useRef(false)
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [guestLimitOpen, setGuestLimitOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [userTier, setUserTier] = useState<'free' | 'vip' | 'guest'>('guest')
  const turnstileTokenRef = useRef<string | null>(null)
  const turnstileWidgetRef = useRef<string | null>(null)  // widget ID for reset

  // Fetch user tier when logged in
  useEffect(() => {
    if (!isLoggedIn) { setUserTier('guest'); return }
    fetch('/api/usage').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.quota?.tier) setUserTier(data.quota.tier as 'free' | 'vip')
      else setUserTier('free')
    }).catch(() => setUserTier('free'))
  }, [isLoggedIn])

  // Turnstile invisible widget — only when site key is configured
  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    if (!siteKey || typeof window === 'undefined') return
    // Wait for the Turnstile script to load
    const init = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ts = (window as any).turnstile
      if (!ts) return
      if (turnstileWidgetRef.current) return  // already rendered
      const container = document.getElementById('mw-turnstile-container')
      if (!container) return
      turnstileWidgetRef.current = ts.render(container, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        callback: (token: string) => { turnstileTokenRef.current = token },
        'expired-callback': () => { turnstileTokenRef.current = null },
        'error-callback':   () => { turnstileTokenRef.current = null },
      })
    }
    // Turnstile script may already be loaded or still loading
    if ((window as any).turnstile) { init() } // eslint-disable-line @typescript-eslint/no-explicit-any
    else { window.addEventListener('load', init) }
    return () => window.removeEventListener('load', init)
  }, [])

  const [heroTitle, setHeroTitle] = useState('')
  const [typedTitle, setTypedTitle] = useState('')
  const [heroSubtitle, setHeroSubtitle] = useState('')
  const [heroPlaceholder, setHeroPlaceholder] = useState('')
  const [subtitleVisible, setSubtitleVisible] = useState(false)

  const activeBranch: Branch = state.branches[state.activeBranchId]
  const ownMessages = activeBranch?.messages ?? []
  const isCurrentBranchStreaming = streamingBranchId === state.activeBranchId
  const hasInput = input.trim().length > 0

  const parentMessages: Message[] = activeBranch?.parentBranchId
    ? buildContext(
        activeBranch.parentBranchId,
        state.branches,
        activeBranch.forkAtMessageIndex ?? undefined
      )
    : []
  const hasParent = parentMessages.length > 0
  const isEmptyState = !hasParent && ownMessages.length === 0
  const showHero = isEmptyState || animatingOut

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ownMessages])

  useEffect(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setInput('')
    setAnimatingOut(false)
    setShowEnterAnims(false)
    if (inputRef.current) inputRef.current.style.height = 'auto'
    if (heroInputRef.current) heroInputRef.current.style.height = 'auto'
    setTimeout(() => {
      heroInputRef.current?.focus()
      inputRef.current?.focus()
    }, 0)
  }, [state.activeBranchId])

  // Typewriter effect for hero — triggers on each branch switch when empty
  useEffect(() => {
    const branch = state.branches[state.activeBranchId]
    const empty = !branch?.parentBranchId && (branch?.messages?.length ?? 0) === 0
    if (!empty) return

    const title = pickHeroTitle()
    setHeroTitle(title)
    setHeroSubtitle(pick(SUBTITLES))
    setHeroPlaceholder(pick(PLACEHOLDERS))
    setTypedTitle('')
    setSubtitleVisible(false)

    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current)

    let i = 0
    typingIntervalRef.current = setInterval(() => {
      i++
      setTypedTitle(title.slice(0, i))
      if (i >= title.length) {
        clearInterval(typingIntervalRef.current!)
        typingIntervalRef.current = null
        setTimeout(() => setSubtitleVisible(true), 200)
      }
    }, 55)

    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current)
        typingIntervalRef.current = null
      }
    }
  }, [state.activeBranchId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sentinel injected at the end of the chat stream carrying the branch title
  const TITLE_MARKER = '\n\n__MW_TITLE__'

  // ── Core streaming function ──────────────────────────────────────────────

  async function streamResponse(
    branchId: string,
    allMessages: { role: string; content: string }[],
    firstUserMessage?: string
  ) {
    dispatch({
      type: 'ADD_MESSAGE',
      branchId,
      message: { id: crypto.randomUUID(), role: 'assistant', content: '' },
    })

    abortControllerRef.current?.abort()
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    setStreamingBranchId(branchId)

    const customInstructions = localStorage.getItem('mw-custom-instructions') || ''
    const aiLang = localStorage.getItem('mw-ai-lang') || 'zh'

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          customInstructions,
          aiLang,
          firstUserMessage,
          turnstileToken: turnstileTokenRef.current ?? undefined,
        }),
        signal: abortController.signal,
      })

      if (!res.ok) {
        let data: Record<string, unknown> = {}
        try { data = await res.json() } catch {}

        // Remove placeholder assistant message before showing modal/inline error
        const trimToIndex = activeBranch.messages.length + 1

        if (res.status === 429) {
          if (data.error === 'GUEST_LIMIT_REACHED') {
            dispatch({ type: 'TRIM_MESSAGES', branchId, toIndex: trimToIndex })
            setGuestLimitOpen(true)
            return
          }
          if (data.error === 'DAILY_LIMIT_EXCEEDED' || data.error === 'MONTHLY_LIMIT_EXCEEDED') {
            dispatch({ type: 'TRIM_MESSAGES', branchId, toIndex: trimToIndex })
            posthog.capture('quota_exceeded', { error: data.error, used: data.used, limit: data.limit })
            setUpgradeOpen(true)
            return
          }
          if (data.error === 'TOKEN_LIMIT_EXCEEDED') {
            const used = (data.usedTokens as number)?.toLocaleString() ?? '—'
            const limit = (data.limit as number)?.toLocaleString() ?? '100,000'
            posthog.capture('quota_exceeded', { used_tokens: data.usedTokens, limit: data.limit })
            dispatch({
              type: 'UPDATE_LAST_MESSAGE', branchId,
              content: `> **本月免费额度已用尽**\n>\n> 已使用 ${used} / ${limit} tokens，下个自然月自动重置。\n>\n> [前往设置查看用量 →](/settings)`,
            })
            return
          }
          dispatch({ type: 'UPDATE_LAST_MESSAGE', branchId, content: '请求过于频繁，请稍后重试。' })
          return
        }

        if (res.status === 403 && data.error === 'MODEL_NOT_ALLOWED') {
          dispatch({ type: 'TRIM_MESSAGES', branchId, toIndex: trimToIndex })
          setUpgradeOpen(true)
          return
        }

        if (res.status === 451 && data.error === 'CONTENT_VIOLATION') {
          dispatch({ type: 'TRIM_MESSAGES', branchId, toIndex: trimToIndex })
          dispatch({ type: 'ADD_MESSAGE', branchId, message: { id: crypto.randomUUID(), role: 'assistant', content: '> ⚠️ 您的消息包含违规内容，已被拦截，本次不计入次数。' } })
          return
        }

        if (res.status === 502) {
          let errorMsg = 'AI 服务暂时不可用，请稍后重试。'
          const aiStatus = data.aiStatus as number | undefined
          if (aiStatus === 401) errorMsg = 'API 密钥无效，请联系管理员。'
          else if (aiStatus === 429) errorMsg = 'AI 请求频率过高，请稍后重试。'
          else if (aiStatus) errorMsg = `AI 服务异常（错误码 ${aiStatus}），请稍后重试。`
          dispatch({ type: 'UPDATE_LAST_MESSAGE', branchId, content: errorMsg })
          return
        }

        throw new Error(`HTTP ${res.status}`)
      }
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let pending = ''
      let rafId: number | null = null

      const flush = () => {
        accumulated = pending
        // Strip title marker from live display if it arrives mid-flush
        const markerIdx = accumulated.indexOf(TITLE_MARKER)
        dispatch({ type: 'UPDATE_LAST_MESSAGE', branchId, content: markerIdx !== -1 ? accumulated.slice(0, markerIdx) : accumulated })
        rafId = null
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          if (rafId === null) rafId = requestAnimationFrame(flush)
        }
        if (rafId !== null) cancelAnimationFrame(rafId)
        const tail = decoder.decode()
        if (tail) pending += tail
        accumulated = pending

        // Extract and remove the title marker from the final content
        const markerIdx = accumulated.indexOf(TITLE_MARKER)
        let branchTitle: string | null = null
        if (markerIdx !== -1) {
          const titleJson = accumulated.slice(markerIdx + TITLE_MARKER.length)
          accumulated = accumulated.slice(0, markerIdx)
          try { branchTitle = JSON.parse(titleJson)?.title ?? null } catch {}
        }

        dispatch({ type: 'UPDATE_LAST_MESSAGE', branchId, content: accumulated })
        if (branchTitle) {
          dispatch({ type: 'SET_BRANCH_TITLE', branchId, title: branchTitle })
          updateTitle(activeConvId, branchTitle)
        }
      } catch (err) {
        if (rafId !== null) cancelAnimationFrame(rafId)
        if ((err as Error).name === 'AbortError') return
        dispatch({ type: 'UPDATE_LAST_MESSAGE', branchId, content: `出错了：${String(err)}` })
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      dispatch({ type: 'UPDATE_LAST_MESSAGE', branchId, content: `出错了：${String(err)}` })
    } finally {
      setStreamingBranchId(null)
    }
  }

  // ── Send new message ─────────────────────────────────────────────────────

  async function sendMessage() {
    const rawContent = input.trim()
    if (!rawContent || isCurrentBranchStreaming) return

    const fromEmpty = isEmptyState
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    if (heroInputRef.current) heroInputRef.current.style.height = 'auto'

    if (fromEmpty) {
      setAnimatingOut(true)
      setTimeout(() => {
        setAnimatingOut(false)
        setShowEnterAnims(true)
        inputRef.current?.focus()
        setTimeout(() => setShowEnterAnims(false), 700)
      }, 380)
    }

    const branchId = state.activeBranchId
    const isFirstMessage = activeBranch.messages.length === 0
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: rawContent }
    dispatch({ type: 'ADD_MESSAGE', branchId, message: userMessage })

    const contextMessages = buildContext(branchId, state.branches)
    const allMessages = [
      ...contextMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: rawContent },
    ]
    await streamResponse(branchId, allMessages, isFirstMessage ? rawContent : undefined)
  }

  // ── Retry last AI response ───────────────────────────────────────────────

  async function retryLastResponse() {
    if (isCurrentBranchStreaming) return
    const msgs = activeBranch.messages
    if (msgs.length < 2 || msgs[msgs.length - 1].role !== 'assistant') return

    const msgsWithoutLastAI = msgs.slice(0, msgs.length - 1)
    dispatch({ type: 'TRIM_MESSAGES', branchId: state.activeBranchId, toIndex: msgs.length - 1 })

    const parentMsgs = activeBranch.parentBranchId
      ? buildContext(activeBranch.parentBranchId, state.branches, activeBranch.forkAtMessageIndex ?? undefined)
      : []

    const allMessages = [
      ...parentMsgs.map((m) => ({ role: m.role, content: m.content })),
      ...msgsWithoutLastAI.map((m) => ({ role: m.role, content: m.content })),
    ]
    await streamResponse(state.activeBranchId, allMessages)
  }

  // ── Edit a user message ──────────────────────────────────────────────────

  async function submitEdit(ownMsgIndex: number, newContent: string) {
    if (!newContent.trim() || isCurrentBranchStreaming) return

    const branchId = state.activeBranchId
    const priorMsgs = activeBranch.messages.slice(0, ownMsgIndex)

    dispatch({ type: 'TRIM_MESSAGES', branchId, toIndex: ownMsgIndex })
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: newContent.trim() }
    dispatch({ type: 'ADD_MESSAGE', branchId, message: userMessage })

    const parentMsgs = activeBranch.parentBranchId
      ? buildContext(activeBranch.parentBranchId, state.branches, activeBranch.forkAtMessageIndex ?? undefined)
      : []

    const allMessages = [
      ...parentMsgs.map((m) => ({ role: m.role, content: m.content })),
      ...priorMsgs.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: newContent.trim() },
    ]
    await streamResponse(branchId, allMessages)
  }

  // ── Create child branch ──────────────────────────────────────────────────

  function createChild() {
    const parent = state.branches[state.activeBranchId]
    const forkIndex = parent.messages.length - 1
    const now = Date.now()
    const base = {
      parentBranchId: state.activeBranchId,
      forkAtMessageIndex: forkIndex >= 0 ? forkIndex : null,
      depth: parent.depth + 1,
      messages: [],
      children: [],
    }
    posthog.capture('branch_forked', { depth: parent.depth + 1 })
    dispatch({
      type: 'FORK',
      parentBranchId: state.activeBranchId,
      forkAtMessageIndex: forkIndex >= 0 ? forkIndex : 0,
      childA: { ...base, id: crypto.randomUUID(), title: '新节点', createdAt: now },
      childB: { ...base, id: crypto.randomUUID(), title: '新节点', createdAt: now + 1 },
    })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (isComposingRef.current || e.nativeEvent.isComposing) return
      e.preventDefault()
      if (hasInput) sendMessage()
    }
  }

  function handleResize(e: React.FormEvent<HTMLTextAreaElement>) {
    const t = e.target as HTMLTextAreaElement
    t.style.height = 'auto'
    t.style.height = `${Math.min(t.scrollHeight, 160)}px`
  }

  return (
    <div className="flex flex-col flex-1 h-full bg-neutral-950 overflow-hidden">
      {/* Turnstile invisible widget container */}
      <div id="mw-turnstile-container" className="hidden" aria-hidden="true" />
      <GuestLimitModal open={guestLimitOpen} onClose={() => setGuestLimitOpen(false)} />
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-neutral-800 shrink-0">
        <button
          onClick={onMenuClick}
          className="md:hidden shrink-0 w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-neutral-200 rounded transition-colors"
          aria-label="打开菜单"
        >
          <Menu size={16} strokeWidth={1.8} />
        </button>
        <span className="text-sm font-medium text-neutral-400 truncate min-w-0">
          {activeBranch?.title}
        </span>
      </div>

      {showHero ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 pb-8 overflow-hidden gap-6 md:gap-14">
          <div className={cn('text-center space-y-4 md:space-y-5', animatingOut && 'hero-exit')}>
            <h2
              className="text-2xl md:text-[1.85rem] leading-snug text-neutral-200 tracking-tight min-h-[2rem] md:min-h-[2.5rem]"
              style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'italic' }}
            >
              {typedTitle}
              {typedTitle.length < heroTitle.length && heroTitle.length > 0 && (
                <span className="inline-block w-px h-6 md:h-7 bg-neutral-400 ml-0.5 align-middle animate-pulse" />
              )}
            </h2>
            <p
              className="text-sm md:text-base text-neutral-500 tracking-wide transition-opacity duration-700"
              style={{ opacity: subtitleVisible ? 1 : 0 }}
            >
              {heroSubtitle}
            </p>
          </div>

          <div className={cn('w-full max-w-2xl', animatingOut && 'input-exit')}>
            <div className="flex items-end gap-2 bg-neutral-800 rounded-3xl px-4 py-2.5 border border-neutral-700 focus-within:border-neutral-500 transition-colors duration-200">
              <textarea
                ref={heroInputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={handleResize}
                onCompositionStart={() => { isComposingRef.current = true }}
                onCompositionEnd={() => { isComposingRef.current = false }}
                placeholder={heroPlaceholder}
                rows={1}
                className="flex-1 bg-transparent text-neutral-100 placeholder:text-neutral-500/60 text-sm leading-relaxed resize-none outline-none min-h-[24px] max-h-40 overflow-y-auto py-0.5"
              />
              <button
                onClick={sendMessage}
                disabled={!hasInput || isCurrentBranchStreaming}
                className={cn(
                  'shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  hasInput
                    ? 'bg-neutral-700 text-neutral-100 hover:bg-neutral-100 hover:text-neutral-950 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200'
                    : 'bg-neutral-700 text-neutral-300',
                )}
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
            {/* Model badge — also visible in hero/empty state */}
            <div className="mt-2">
              <TierModelBadge userTier={userTier} onUpgradeClick={() => setUpgradeOpen(true)} />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className={cn('flex-1 overflow-y-auto px-4 md:px-6 py-6', showEnterAnims && 'msgs-enter')}>
            <div className="max-w-3xl mx-auto space-y-6">

              {/* Parent message chain — no actions */}
              {parentMessages.map((msg) => (
                <MessageBubble key={`ctx-${msg.id}`} message={msg} />
              ))}

              {hasParent && (
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-neutral-800" />
                  <span className="text-xs text-neutral-600 shrink-0 select-none">从这里继续</span>
                  <div className="flex-1 h-px bg-neutral-800" />
                </div>
              )}

              {hasParent && ownMessages.length === 0 && (
                <div className="flex justify-center py-4">
                  <p className="text-neutral-500 text-sm tracking-wide">继续这个方向的对话</p>
                </div>
              )}

              {/* Own messages — with actions */}
              {ownMessages.map((msg, i) => {
                const isLastMsg = i === ownMessages.length - 1
                const isStreaming = isCurrentBranchStreaming && isLastMsg && msg.role === 'assistant'
                const canRetry = msg.role === 'assistant' && isLastMsg && !isCurrentBranchStreaming
                const canEdit = msg.role === 'user' && !isCurrentBranchStreaming

                return (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isStreaming={isStreaming}
                    onRetry={canRetry ? retryLastResponse : undefined}
                    onEdit={canEdit ? (newContent) => submitEdit(i, newContent) : undefined}
                  />
                )
              })}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Bottom input */}
          <div
            className={cn('px-4 md:px-6 pt-2 shrink-0', showEnterAnims && 'input-enter')}
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1.5rem)' }}
          >
            <div className="max-w-3xl mx-auto">
              {/* Model badge (tier-based, read-only) */}
              <TierModelBadge userTier={userTier} onUpgradeClick={() => setUpgradeOpen(true)} />
              <div className="flex items-end gap-2 bg-neutral-800 rounded-3xl px-4 py-2.5 border border-neutral-700 focus-within:border-neutral-500 transition-colors duration-200">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onInput={handleResize}
                  onCompositionStart={() => { isComposingRef.current = true }}
                  onCompositionEnd={() => { isComposingRef.current = false }}
                  placeholder="发送消息，或新建方向探索…"
                  rows={1}
                  className="flex-1 bg-transparent text-neutral-100 placeholder:text-neutral-400 text-sm leading-relaxed resize-none outline-none min-h-[24px] max-h-40 overflow-y-auto py-0.5"
                />
                <button
                  onClick={hasInput ? sendMessage : createChild}
                  disabled={isCurrentBranchStreaming}
                  className={cn(
                    'shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                    hasInput
                      ? 'bg-neutral-700 text-neutral-100 hover:bg-neutral-100 hover:text-neutral-950 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200'
                      : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600 hover:text-neutral-100',
                  )}
                  title={hasInput ? '发送' : '新建方向'}
                >
                  {hasInput ? (
                    <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                  ) : (
                    <GitBranch className="w-4 h-4" strokeWidth={2} />
                  )}
                </button>
              </div>
              <p className="text-xs text-neutral-500 text-center mt-1.5 tracking-wide select-none">
                内容由 AI 生成，请注意甄别
              </p>
            </div>
          </div>
        </>
      )}

    </div>
  )
}
