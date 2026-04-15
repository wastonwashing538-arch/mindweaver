'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('mw-theme', next ? 'dark' : 'light') } catch {}
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? '切换浅色模式' : '切换深色模式'}
      className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-all duration-200"
    >
      {isDark
        ? <Sun  size={14} strokeWidth={1.8} />
        : <Moon size={14} strokeWidth={1.8} />
      }
    </button>
  )
}
