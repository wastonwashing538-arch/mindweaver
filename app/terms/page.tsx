import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '用户协议 — MindWeaver',
  description: 'MindWeaver 用户服务协议',
}

export default function TermsPage() {
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
          用户协议
        </h1>
        <p className="text-neutral-600 text-xs mb-10">最后更新：2025年5月</p>

        <div className="space-y-8 text-sm text-neutral-400 leading-relaxed">

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">一、服务说明</h2>
            <p>
              MindWeaver 是一款基于 AI 的树状对话思考工具，帮助用户以分支结构探索和整理思维。
              注册即表示您同意本协议所有条款。
            </p>
          </section>

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">二、使用规范</h2>
            <p>使用 MindWeaver 时，您不得：</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-neutral-500">
              <li>生成、传播违反中国法律法规的内容</li>
              <li>散布谣言、虚假信息或侵害他人权益的内容</li>
              <li>尝试绕过系统限制、破解或攻击服务器</li>
              <li>利用本服务进行任何形式的商业欺诈</li>
              <li>通过技术手段批量滥用免费额度</li>
            </ul>
            <p className="mt-3">
              违反上述规定，我们有权暂停或永久终止您的账号，不予退款。
            </p>
          </section>

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">三、免费额度与付费</h2>
            <p>
              每位注册用户每月享有 <strong className="text-neutral-300">10 万 token</strong> 的免费使用额度，
              超出后需升级至付费套餐。免费额度每月自然月重置，不可累积。
            </p>
            <p className="mt-2">
              付费套餐的具体定价以届时官网公告为准。已付费金额在服务正常运营期间不予退款。
            </p>
          </section>

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">四、AI 内容免责</h2>
            <p>
              MindWeaver 的 AI 回复由第三方模型生成，内容仅供参考，
              不构成任何专业领域（法律、医疗、投资、心理咨询等）的正式建议。
              用户须自行评估并承担使用 AI 内容的风险和后果。
            </p>
            <p className="mt-2">
              我们不对 AI 生成内容的准确性、完整性或适用性作出保证。
            </p>
          </section>

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">五、知识产权</h2>
            <p>
              您在 MindWeaver 中创建的对话内容归您所有。
              MindWeaver 的界面设计、代码、品牌归服务方所有。
            </p>
          </section>

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">六、服务变更与中断</h2>
            <p>
              我们保留随时修改、暂停或终止服务的权利，
              重大变更将提前通过邮件或站内通知告知用户。
              因不可抗力（服务器故障、API 中断等）导致的服务中断，我们不承担赔偿责任。
            </p>
          </section>

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">七、协议修改</h2>
            <p>
              本协议可能随时更新，更新后继续使用服务即视为接受新协议。
              建议定期查阅本页面。
            </p>
          </section>

          <section>
            <h2 className="text-neutral-200 text-base font-medium mb-3">八、适用法律</h2>
            <p>
              本协议受中华人民共和国法律管辖。如发生争议，双方应友好协商解决；
              协商不成的，提交服务方所在地有管辖权的法院裁决。
            </p>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-neutral-800 flex gap-4 text-xs text-neutral-600">
          <Link href="/privacy" className="hover:text-neutral-400 transition-colors">隐私政策</Link>
          <Link href="/" className="hover:text-neutral-400 transition-colors">返回首页</Link>
        </div>
      </div>
    </div>
  )
}
