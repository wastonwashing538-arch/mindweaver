import type { Metadata, Viewport } from 'next'
import { Geist, Cormorant_Garamond, Instrument_Serif } from 'next/font/google'
import { Suspense } from 'react'
import Script from 'next/script'
import { AuthProvider } from '@/lib/auth-context'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PostHogProvider, PostHogPageview } from '@/components/PostHogProvider'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['italic'],
  variable: '--font-brand',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
}

export const metadata: Metadata = {
  title: {
    default: 'MindWeaver — 分支思考，向上整合',
    template: '%s — MindWeaver',
  },
  description: '个人思考工具。每条对话都是一棵树，在不同分支中深入探索，向上整合洞见。由 DeepSeek AI 驱动。',
  keywords: ['AI思考工具', '分支对话', '思维导图', 'DeepSeek', '个人知识管理'],
  authors: [{ name: 'MindWeaver' }],
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    title: 'MindWeaver — 分支思考，向上整合',
    description: '个人思考工具。每条对话都是一棵树，在不同分支中深入探索，向上整合洞见。',
    siteName: 'MindWeaver',
  },
  twitter: {
    card: 'summary',
    title: 'MindWeaver — 分支思考，向上整合',
    description: '个人思考工具。树状对话，AI 驱动。',
  },
}

// Runs before first paint to prevent theme flash
// Default is light mode; only add 'dark' class if user previously chose dark
// Also removes old 'light' class from previous theme system for backward compat
const themeScript = `
(function(){
  try {
    var h = document.documentElement;
    h.classList.remove('light');
    var t = localStorage.getItem('mw-theme');
    if (t === 'dark') h.classList.add('dark');
  } catch(e) {}
})();
`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geist.className} ${instrumentSerif.variable} ${cormorant.variable} h-full bg-neutral-950 antialiased`} suppressHydrationWarning>
        <PostHogProvider>
          <ErrorBoundary>
            <AuthProvider>
              {children}
            </AuthProvider>
          </ErrorBoundary>
          <Suspense>
            <PostHogPageview />
          </Suspense>
          <Analytics />
          {/* Umami analytics */}
          <Script
            src="https://cloud.umami.is/script.js"
            data-website-id="6da1504d-5d11-4a51-86f9-75e3d96cc957"
            strategy="afterInteractive"
          />
          {/* Cloudflare Turnstile — only load when site key is configured */}
          {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
          )}
        </PostHogProvider>
      </body>
    </html>
  )
}
