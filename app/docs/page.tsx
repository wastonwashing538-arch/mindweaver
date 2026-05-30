import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: '使用指南',
  description: 'MindWeaver 使用说明文档',
}

const SECTIONS = [
  {
    title: '什么是树状对话？',
    body: '每一条对话本质上都是一棵树。传统聊天工具强迫你在一条线上走，MindWeaver 让每个想法都能分叉出新的方向，并行深入探索。',
  },
  {
    title: '如何创建分支',
    body: '对话进行中，点击右下角的分叉图标，系统会在当前位置生成两个新的分支节点。你可以在不同分支里沿着完全不同的方向继续提问。',
  },
  {
    title: '侧边栏与节点导航',
    body: '左侧侧边栏显示所有叶节点胶囊，代表当前对话树的所有"末梢"。点击任意胶囊切换到该分支。展开树图按钮可查看完整的树状结构。',
  },
  {
    title: '多对话管理',
    body: '点击顶部"+"号新建对话，历史记录按时间分组（今天 / 昨天 / 最近 7 天）。登录后对话自动同步到云端，换设备也不会丢失。',
  },
  {
    title: '选择 AI 模型',
    body: '输入框上方可切换 AI 模型。免费用户使用 DeepSeek R1，Pro 用户可访问 Claude、GPT-4o、Gemini 等高级模型。',
  },
  {
    title: '免费版与 Pro 的区别',
    body: '免费版：每天 50 次对话，仅限 DeepSeek R1 模型。Pro 版：每月 3000 次对话，全部高级模型可用，数据永久保存。',
  },
  {
    title: '自定义指令',
    body: '在设置页"自定义指令"中告诉 AI 关于你自己的背景、偏好或期望的回答风格，AI 会在每次回答时参考这些信息。',
  },
  {
    title: '数据安全与隐私',
    body: '你的对话数据存储在 Supabase 加密数据库中，仅你自己可见。账号注销后所有数据立即删除。',
  },
]

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-8">
      <div className="max-w-lg mx-auto">

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors mb-8"
        >
          <ArrowLeft size={12} />
          返回
        </Link>

        <div className="mb-10">
          <h1
            className="text-neutral-100 mb-1"
            style={{ fontFamily: 'var(--font-brand), Georgia, serif', fontStyle: 'italic', fontWeight: 500, fontSize: '1.5rem' }}
          >
            MindWeaver
          </h1>
          <p className="text-xs text-neutral-600">使用指南</p>
        </div>

        <div className="space-y-6">
          {SECTIONS.map((s, i) => (
            <div key={i} className="rounded-2xl border border-neutral-800 bg-neutral-900 px-5 py-4">
              <h2 className="text-sm font-medium text-neutral-200 mb-2">{s.title}</h2>
              <p className="text-xs text-neutral-500 leading-relaxed">{s.body}</p>
            </div>
          ))}

          <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 px-5 py-4 text-center">
            <p className="text-xs text-neutral-600">文档持续完善中 · 如有疑问欢迎通过设置页反馈</p>
          </div>
        </div>

        <div className="mt-10 flex gap-4 justify-center text-xs text-neutral-700">
          <a href="/privacy" className="hover:text-neutral-500 transition-colors">隐私政策</a>
          <a href="/terms" className="hover:text-neutral-500 transition-colors">用户协议</a>
        </div>

      </div>
    </div>
  )
}
