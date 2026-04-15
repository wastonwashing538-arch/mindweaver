'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check, RotateCcw, Pencil } from 'lucide-react'
import { Message } from '@/lib/types'
import { cn } from '@/lib/utils'

function useCopy() {
  const [copied, setCopied] = useState(false)
  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }
  return { copied, copy }
}

function CopyableCodeBlock({ children }: { children: string }) {
  const { copied, copy } = useCopy()
  return (
    <div className="relative mb-3 last:mb-0">
      <code className="block bg-neutral-900 rounded-lg px-4 py-3 text-sm font-mono text-neutral-300 overflow-x-auto whitespace-pre pr-10 leading-relaxed">
        {children}
      </code>
      <button
        onClick={() => copy(children)}
        title="复制代码"
        className="absolute top-2 right-2 w-6 h-6 rounded flex items-center justify-center text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-all duration-150"
      >
        {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2} />}
      </button>
    </div>
  )
}

// Shared small action button style
function ActionBtn({
  onClick, title, children, danger,
}: {
  onClick: () => void; title?: string; children: React.ReactNode; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-all duration-150',
        danger
          ? 'text-neutral-600 hover:text-red-400 hover:bg-neutral-800/60'
          : 'text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800/60'
      )}
    >
      {children}
    </button>
  )
}

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
  onRetry?: () => void
  onEdit?: (newContent: string) => void
}

export function MessageBubble({ message, isStreaming, onRetry, onEdit }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const { copied, copy } = useCopy()
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(message.content)
  const isComposingRef = useRef(false)
  const editRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize edit textarea
  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.style.height = 'auto'
      editRef.current.style.height = `${editRef.current.scrollHeight}px`
      editRef.current.focus()
      // place cursor at end
      editRef.current.selectionStart = editRef.current.value.length
    }
  }, [isEditing])

  function confirmEdit() {
    if (!editValue.trim()) return
    onEdit?.(editValue.trim())
    setIsEditing(false)
  }

  function cancelEdit() {
    setEditValue(message.content)
    setIsEditing(false)
  }

  // ── User message ─────────────────────────────────────────────────────────
  if (isUser) {
    if (isEditing) {
      return (
        <div className="flex justify-end">
          <div className="max-w-[75%] min-w-0 w-full flex flex-col gap-2">
            <textarea
              ref={editRef}
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${e.target.scrollHeight}px`
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  confirmEdit()
                }
                if (e.key === 'Escape') cancelEdit()
              }}
              onCompositionStart={() => { isComposingRef.current = true }}
              onCompositionEnd={() => { isComposingRef.current = false }}
              rows={1}
              className="w-full bg-neutral-700 text-neutral-100 rounded-2xl rounded-br-sm px-4 py-3 text-[15px] resize-none outline-none leading-relaxed overflow-hidden"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={cancelEdit}
                className="text-xs text-neutral-500 hover:text-neutral-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmEdit}
                disabled={!editValue.trim()}
                className="text-xs text-neutral-100 bg-neutral-700 hover:bg-neutral-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="max-w-[75%] min-w-0 bg-neutral-700 text-neutral-100 rounded-2xl rounded-br-sm px-4 py-3 text-[15px] whitespace-pre-wrap break-words leading-relaxed">
          {message.content}
        </div>
        {onEdit && (
          <div className="flex items-center pr-1">
            <ActionBtn onClick={() => { setEditValue(message.content); setIsEditing(true) }} title="修改">
              <Pencil size={10} strokeWidth={2} />
              修改
            </ActionBtn>
          </div>
        )}
      </div>
    )
  }

  // ── AI message ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      <div className="text-neutral-200 prose-bubble text-[15px] leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="text-xl font-bold mt-5 mb-2 first:mt-0 text-neutral-100">{children}</h1>,
            h2: ({ children }) => <h2 className="text-lg font-bold mt-4 mb-2 first:mt-0 text-neutral-100">{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-1 first:mt-0 text-neutral-100">{children}</h3>,
            p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
            ul: ({ children }) => <ul className="mb-3 pl-5 space-y-1 list-disc marker:text-neutral-500">{children}</ul>,
            ol: ({ children }) => <ol className="mb-3 pl-5 space-y-1 list-decimal marker:text-neutral-500">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            code: ({ children, className }) => {
              const isBlock = className?.includes('language-')
              const text = String(children).replace(/\n$/, '')
              if (isBlock) return <CopyableCodeBlock>{text}</CopyableCodeBlock>
              return (
                <code className="bg-neutral-800 rounded px-1.5 py-0.5 text-[13px] font-mono text-neutral-300">
                  {children}
                </code>
              )
            },
            pre: ({ children }) => <>{children}</>,
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-neutral-600 pl-4 italic text-neutral-400 mb-3">
                {children}
              </blockquote>
            ),
            strong: ({ children }) => <strong className="font-semibold text-neutral-100">{children}</strong>,
            em: ({ children }) => <em className="italic text-neutral-300">{children}</em>,
            hr: () => <hr className="border-neutral-700/60 my-4" />,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer"
                className="text-amber-400/80 hover:text-amber-300 underline underline-offset-2">
                {children}
              </a>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto mb-3">
                <table className="w-full text-sm border-collapse">{children}</table>
              </div>
            ),
            th: ({ children }) => <th className="border border-neutral-700 px-3 py-1.5 text-left font-semibold text-neutral-200 bg-neutral-800/60">{children}</th>,
            td: ({ children }) => <td className="border border-neutral-700 px-3 py-1.5 text-neutral-300">{children}</td>,
          }}
        >
          {message.content}
        </ReactMarkdown>
        {isStreaming && (
          <span className="inline-block w-0.5 h-[1.1em] bg-neutral-400/60 ml-0.5 animate-pulse align-middle" />
        )}
      </div>

      {/* Action row — always visible, hidden while streaming */}
      {!isStreaming && message.content && (
        <div className="flex items-center gap-0.5 -ml-2">
          <ActionBtn onClick={() => copy(message.content)} title="复制全文">
            {copied ? <Check size={10} strokeWidth={2.5} /> : <Copy size={10} strokeWidth={2} />}
            {copied ? '已复制' : '复制'}
          </ActionBtn>
          {onRetry && (
            <ActionBtn onClick={onRetry} title="重新生成">
              <RotateCcw size={10} strokeWidth={2} />
              重试
            </ActionBtn>
          )}
        </div>
      )}
    </div>
  )
}
