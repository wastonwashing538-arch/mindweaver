'use client'

import { useRef, useEffect, useState, KeyboardEvent } from 'react'
import { ArrowUp, GitBranch } from 'lucide-react'
import { useBranch, buildContext } from '@/lib/branch-context'
import { useConversation } from '@/lib/conversation-context'
import { Branch, Message } from '@/lib/types'
import { MessageBubble } from './MessageBubble'
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

export function ChatArea() {
  const { state, dispatch } = useBranch()
  const { activeConvId, updateTitle } = useConversation()
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

  async function generateTitle(branchId: string, firstUserMessage: string) {
    try {
      const res = await fetch('/api/generate-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: firstUserMessage }),
      })
      const { title } = await res.json()
      if (title) {
        dispatch({ type: 'SET_BRANCH_TITLE', branchId, title })
        updateTitle(activeConvId, title)
      }
    } catch {
      // non-critical
    }
  }

  // ── Core streaming function ──────────────────────────────────────────────

  async function streamResponse(
    branchId: string,
    allMessages: { role: string; content: string }[]
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
        body: JSON.stringify({ messages: allMessages, customInstructions, aiLang }),
        signal: abortController.signal,
      })

      if (!res.ok) {
        if (res.status === 429) {
          let data: { error?: string; usedTokens?: number; limit?: number } = {}
          try { data = await res.json() } catch {}
          if (data.error === 'TOKEN_LIMIT_EXCEEDED') {
            const used = data.usedTokens?.toLocaleString() ?? '—'
            const limit = data.limit?.toLocaleString() ?? '100,000'
            posthog.capture('quota_exceeded', { used_tokens: data.usedTokens, limit: data.limit })
            dispatch({
              type: 'UPDATE_LAST_MESSAGE',
              branchId,
              content: `> **本月免费额度已用尽**\n>\n> 已使用 ${used} / ${limit} tokens，下个自然月自动重置。\n>\n> [前往设置查看用量 →](/settings)`,
            })
            return
          }
        }
        if (res.status === 502) {
          let errorMsg = 'AI 服务暂时不可用，请稍后重试。'
          try {
            const errData: { error?: string; deepseekStatus?: number } = await res.json()
            if (errData.deepseekStatus === 401) errorMsg = 'API 密钥无效，请联系管理员。'
            else if (errData.deepseekStatus === 429) errorMsg = 'AI 请求频率过高，请稍后重试。'
            else if (errData.deepseekStatus) errorMsg = `AI 服务异常（错误码 ${errData.deepseekStatus}），请稍后重试。`
          } catch {}
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
        dispatch({ type: 'UPDATE_LAST_MESSAGE', branchId, content: accumulated })
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
        dispatch({ type: 'UPDATE_LAST_MESSAGE', branchId, content: accumulated })
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
    if (isFirstMessage) generateTitle(branchId, rawContent)

    const contextMessages = buildContext(branchId, state.branches)
    const allMessages = [
      ...contextMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: rawContent },
    ]
    await streamResponse(branchId, allMessages)
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

      {/* Top bar */}
      <div className="flex items-center px-6 py-3 border-b border-neutral-800 shrink-0">
        <span className="text-sm font-medium text-neutral-400">
          {activeBranch?.title}
        </span>
      </div>

      {showHero ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 overflow-hidden gap-14">
          <div className={cn('text-center space-y-5', animatingOut && 'hero-exit')}>
            <h2
              className="text-[1.85rem] leading-snug text-neutral-200 tracking-tight min-h-[2.5rem]"
              style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'italic' }}
            >
              {typedTitle}
              {typedTitle.length < heroTitle.length && heroTitle.length > 0 && (
                <span className="inline-block w-px h-7 bg-neutral-400 ml-0.5 align-middle animate-pulse" />
              )}
            </h2>
            <p
              className="text-base text-neutral-500 tracking-wide transition-opacity duration-700"
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
          </div>
        </div>
      ) : (
        <>
          <div className={cn('flex-1 overflow-y-auto px-6 py-6', showEnterAnims && 'msgs-enter')}>
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
          <div className={cn('px-6 pb-6 pt-2 shrink-0', showEnterAnims && 'input-enter')}>
            <div className="max-w-3xl mx-auto">
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
