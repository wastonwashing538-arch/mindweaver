export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface Branch {
  id: string
  title: string
  parentBranchId: string | null
  forkAtMessageIndex: number | null
  depth: number       // 0 = root, 1 = first child, etc.
  createdAt: number   // Date.now(), used for sidebar capsule ordering
  messages: Message[]
  children: string[]
}

export interface ProjectState {
  branches: Record<string, Branch>
  rootBranchId: string
  activeBranchId: string
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  projectState: ProjectState
}
