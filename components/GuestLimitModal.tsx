'use client'

import { useRouter } from 'next/navigation'
import { X, LogIn } from 'lucide-react'

interface GuestLimitModalProps {
  open: boolean
  onClose: () => void
}

export function GuestLimitModal({ open, onClose }: GuestLimitModalProps) {
  const router = useRouter()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal card */}
      <div
        className="relative z-10 w-full max-w-sm bg-neutral-900 border border-neutral-700 rounded-2xl p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
        >
          <X size={14} />
        </button>

        {/* Icon */}
        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center mb-4">
          <LogIn size={18} className="text-neutral-400" />
        </div>

        {/* Content */}
        <h3 className="text-neutral-100 font-medium text-base mb-1.5">
          今日免费次数已用完
        </h3>
        <p className="text-neutral-500 text-sm leading-relaxed mb-5">
          游客每天可免费体验 10 次对话。登录后每天可使用 50 次，数据也会保存到云端。
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => { router.push('/auth'); onClose() }}
            className="w-full h-10 rounded-xl bg-neutral-100 text-neutral-900 text-sm font-medium hover:bg-white transition-colors"
          >
            登录 / 注册
          </button>
          <button
            onClick={onClose}
            className="w-full h-10 rounded-xl text-neutral-500 text-sm hover:text-neutral-300 transition-colors"
          >
            稍后再说
          </button>
        </div>
      </div>
    </div>
  )
}
