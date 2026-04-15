import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '隐私政策 — MindWeaver',
  description: 'MindWeaver 隐私政策',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-12">
      <div className="max-w-2xl mx-auto">

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors mb-10"
        >
          <ArrowLeft size={12} />
          返回
        </Link>

        <h1
          className="text-neutral-100 mb-2"
          style={{
            fontFamily: 'var(--font-brand), Georgia, serif',
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: '1.75rem',
          }}
        >
          隐私政策
        </h1>
        <p className="text-neutral-600 text-xs mb-10">最后更新：2025年5月</p>

        <div className="space-y-8 text-sm text-neutral-400 leading-relaxed">

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">一、我们收集哪些信息</h2>
            <p>使用 MindWeaver 时，我们收集以下信息：</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-neutral-500">
              <li>账号信息：您的邮箱地址（用于登录和身份验证）</li>
              <li>对话数据：您在 MindWeaver 中创建的对话和分支内容</li>
              <li>使用统计：AI 调用的 token 消耗量（用于服务计费和优化）</li>
              <li>设备信息：浏览器类型、操作系统（用于问题排查）</li>
            </ul>
            <p className="mt-3">
              未注册用户的对话数据仅存储在本地浏览器中，我们无法访问。
            </p>
          </section>

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">二、我们如何使用信息</h2>
            <ul className="list-disc list-inside space-y-1 text-neutral-500">
              <li>提供和改进 MindWeaver 服务</li>
              <li>统计 token 消耗，管理免费额度和付费套餐</li>
              <li>发送账号相关通知（如邮箱验证、密码重置）</li>
              <li>排查技术问题，保障服务稳定</li>
            </ul>
            <p className="mt-3">
              我们不会将您的个人信息或对话内容出售给第三方。
            </p>
          </section>

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">三、AI 内容免责声明</h2>
            <p>
              MindWeaver 使用 DeepSeek AI 模型生成回复。AI 生成的内容为辅助参考，
              不构成专业意见（包括但不限于法律、医疗、投资建议）。
              用户应自行判断并为最终决策负责。
            </p>
            <p className="mt-2">
              您输入的对话内容会发送至 DeepSeek API 服务器处理，适用
              <a
                href="https://www.deepseek.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-300 underline underline-offset-2 hover:text-neutral-100 ml-1"
              >
                DeepSeek 隐私政策
              </a>
              。请勿在对话中输入敏感个人信息。
            </p>
          </section>

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">四、数据存储与安全</h2>
            <p>
              您的数据存储在 Supabase 提供的数据库服务中，服务器位于海外。
              我们采用行级安全策略（RLS）确保用户之间的数据隔离，
              传输过程使用 HTTPS 加密。
            </p>
            <p className="mt-2">
              我们不保证数据永久存储。建议您对重要内容进行本地备份。
            </p>
          </section>

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">五、您的权利</h2>
            <ul className="list-disc list-inside space-y-1 text-neutral-500">
              <li>访问权：您可以随时查看自己的对话数据</li>
              <li>删除权：您可以在设置页面注销账号，所有数据将被永久删除</li>
              <li>导出权：如需导出数据，请联系我们</li>
            </ul>
          </section>

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">六、Cookie</h2>
            <p>
              我们使用 Cookie 维持登录状态，不使用用于广告追踪的第三方 Cookie。
            </p>
          </section>

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">七、联系我们</h2>
            <p>
              如对本隐私政策有任何疑问，请发送邮件至：
              <a
                href="mailto:wastonwashing538@gmail.com"
                className="text-neutral-300 ml-1 hover:text-neutral-100 transition-colors"
              >
                wastonwashing538@gmail.com
              </a>
            </p>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-neutral-800 flex gap-4 text-xs text-neutral-600">
          <Link href="/terms" className="hover:text-neutral-400 transition-colors">用户协议</Link>
          <Link href="/" className="hover:text-neutral-400 transition-colors">返回首页</Link>
        </div>
      </div>
    </div>
  )
}
