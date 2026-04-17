# MindWeaver 项目文档
> Claude Code 每次会话自动读取此文件。

## 当前开发状态（2026-04-17）
- **阶段一至十已完成**（含 UI 打磨、持久化、多对话管理、DeepSeek 接入、Vercel 部署、品牌视觉）
- 启动：`npm run dev`，访问 http://localhost:3000
- **线上地址**：https://mindweaver-three.vercel.app（已连接 GitHub，push 自动部署）
- **当前任务**：品牌视觉 + Hero Banner 优化（刚完成）
- **下一步**：移动端适配 → 订阅付费

## 目标用户
- **主要面向中国大陆用户**
- 用户无需翻墙，所有 AI 调用走 DeepSeek 国内直连 API
- 支付方式未来考虑支付宝/微信，Stripe 不在近期计划内

## 关键技术决策（勿改）
- AI 调用：**直接 fetch DeepSeek API，不用 Vercel AI SDK**
  - 手动解析 SSE，只转发 `content` 字段
  - endpoint: `https://api.deepseek.com/chat/completions`
  - 模型：`deepseek-chat`（DeepSeek-V3）
  - env: `DEEPSEEK_API_KEY`
- Markdown 渲染：`react-markdown` + `remark-gfm`，仅 assistant 消息渲染，user 消息保持纯文本
- 图标库：`lucide-react`
- 状态持久化：localStorage（`mw-conversations` / `mw-active-conv-id` / `mw-theme`）
- 多对话管理：`ConversationProvider`（外层）+ `BranchProvider key={activeConvId}`（内层，key 变化强制重挂载）

---

## 项目命名候选

| 英文 | 中文 | 说明 |
|------|------|------|
| **Canopy.ai** | 思冠 | 最推荐。Canopy=森林冠层，完美对应"向上整合+向下发散" |
| Tendril.ai | 衍思 | 植物探索性卷须，气质贴合私人沉浸思考工具 |
| Dendrite.ai | 树突 | 神经元树突，与产品逻辑高度吻合 |

---

## 核心产品定位

**个人思考工具**（非协作/分享型产品）

> 对话本质上就是一棵树。线性聊天 UI 是对真实结构的"压缩损失"。
> 树状结构应该**是**对话，而不是对话的副产品。

---

## 界面架构

```
┌──────────────────────┬──────────────────────────────────────┐
│ 叶节点胶囊（侧边栏）  │  当前对话（主屏）                     │
│  可拖拽右边缘展开树图 │                                      │
│  时钟图标→历史记录    │  [父分支消息，完整展示，无降调]        │
│  + 号→新建对话       │  ─────────── 分叉于此 ───────────     │
│                      │  User: ...                           │
│  ╭──────────────╮    │  AI: ... (Markdown 渲染)             │
│  │ 对话摘要文字  │    │                                      │
│  ╰──────────────╯    │  ╭────────────────────── [●] ╮       │
│                      │  │ 输入框（胶囊型）           │       │
└──────────────────────┴──────────────────────────────────────┘
```

---

## System Prompt（`/api/chat`）

```
你是用户的私人思考伙伴，运行在一个树状对话工具里。

工具特点：每条对话可以分叉成多个方向，用户在不同分支里分别深入探索。
你的职责是帮助用户把一个方向想深、想透，并在适当时候点出值得拆开探索的岔路。

回答原则：
- 直接给结论和判断，不做信息罗列，不中立骑墙
- 优先给用户没想到的角度，简单问题3-5句，复杂问题用标题+列表+粗体
- 默认控制在300字以内，用户要求详细时可突破

结尾必须输出（每次）：
---
**可以继续探索：**
- [方向一，8字以内，动词开头]
- [方向二]
- [方向三]
```

---

## 数据模型

```typescript
interface Branch {
  id: string; title: string
  parentBranchId: string | null; forkAtMessageIndex: number | null
  depth: number; createdAt: number
  messages: Message[]; children: string[]
}

interface ProjectState {
  branches: Record<string, Branch>
  rootBranchId: string; activeBranchId: string
}

interface Conversation {
  id: string; title: string
  createdAt: number; updatedAt: number
  projectState: ProjectState
}
```

---

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16 |
| UI | Tailwind CSS v4 + lucide-react |
| Markdown | react-markdown + remark-gfm |
| AI 调用 | 直接 fetch DeepSeek API（deepseek-chat） |
| 状态管理 | React Context + useReducer |
| 持久化 | localStorage（`lib/storage.ts` 抽象层，预留 Supabase 迁移接口） |
| 部署 | Vercel（已上线，GitHub 自动部署，`DEEPSEEK_API_KEY` 已配置） |

---

## 开发历史（简）

- **阶段一至四**：MVP——分支状态管理、流式输出、节点标题生成
- **阶段五**：选中文字创建分支（后删除）
- **阶段六**：综述卡片（后删除）
- **阶段七**：UI 打磨——Markdown 渲染、侧边栏树、胶囊型输入框
- **阶段八**：大重设计——叶节点胶囊视图、深度色阶、树图拖拽展开、父消息链展示、主题切换、IME 修复
- **阶段九**：多对话管理——localStorage 持久化、新建/切换/删除对话、历史记录视图、消息复制
- **阶段十**：品牌视觉——MindWeaver logo（侧边栏、登录页、favicon）、Hero Banner 三组随机语料库（时段问候/产品定位/行动占位符）、打字机动画

---

## 后续计划

### 近期
- [ ] **移动端适配**：侧边栏收起、响应式布局
- [ ] **自定义域名**：绑定到 Vercel 项目

### 中期
- [ ] **设置页面**：账号管理完善
- [ ] **云端持久化**：Supabase Postgres，替换 `lib/storage.ts` 函数体（用户登录已有 Supabase Auth）

### 远期
- [ ] **订阅付费**：国内支付宝/微信，定价待定
- [ ] **知识库 AI**：将对话内容沉淀为可检索的知识库
- [ ] **多模型支持**：用户可选 DeepSeek / Qwen / Kimi 等

### 已完成
- [x] **用户登录**：Supabase Auth（邮箱登录）
- [x] **Vercel 部署**：已上线，GitHub 自动部署
- [x] **隐私政策 + 用户协议**：已有 `/privacy` 和 `/terms` 页面
- [x] **品牌视觉**：Logo、favicon、Hero Banner 动效与语料库

---

## 回复语言
所有文字回复使用简体中文，技术术语、代码、补充说明可用英文。

## 工作流规范
- 每次完成代码修改后，**自动执行 `git add`、`git commit`、`git push`**，无需用户单独要求
- commit message 用中文简要描述本次改动内容
