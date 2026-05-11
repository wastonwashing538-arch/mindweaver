'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { initPostHog, posthog } from '@/lib/posthog'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog()
  }, [])

  return <>{children}</>
}

// Tracks page views on navigation — mount inside <Suspense>
export function PostHogPageview() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const lastUrl = useRef<string>('')

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')
    if (url === lastUrl.current) return
    lastUrl.current = url
    posthog.capture('$pageview', { $current_url: window.location.href })
  }, [pathname, searchParams])

  return null
}
