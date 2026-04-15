import type { Metadata } from 'next'
import { Geist, Cormorant_Garamond, Instrument_Serif } from 'next/font/google'
import { AuthProvider } from '@/lib/auth-context'
import { ErrorBoundary } from '@/components/ErrorBoundary'
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

export const metadata: Metadata = {
  title: {
    default: 'MindWeaver — 分支思考，向上整合',
    template: '%s — MindWeaver',
  },
  description: '个人思考工具。每条对话都是一棵树，在不同分支中深入探索，向上整合洞见。由 DeepSeek AI 驱动。',
  keywords: ['AI思考工具', '分支对话', '思维导图', 'DeepSeek', '个人知识管理'],
  authors: [{ name: 'MindWeaver' }],
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
        <ErrorBoundary>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
