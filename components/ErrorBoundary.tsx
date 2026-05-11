'use client'

import { Component, ErrorInfo, ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-4">
        <div className="text-center max-w-sm">
          <div className="text-neutral-600 text-xs mb-4 font-mono">
            {this.state.error?.message ?? '未知错误'}
          </div>
          <p className="text-neutral-400 text-sm mb-6">
            页面遇到了一个错误，请刷新重试。
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-neutral-300 border border-neutral-700 hover:border-neutral-500 transition-colors"
          >
            <RefreshCw size={13} strokeWidth={1.8} />
            刷新页面
          </button>
        </div>
      </div>
    )
  }
}
