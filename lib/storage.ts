import { Conversation } from './types'

const CONV_KEY = 'mw-conversations'
const ACTIVE_KEY = 'mw-active-conv-id'

// ─────────────────────────── localStorage (guest mode) ────────────────────

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CONV_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Conversation[]
  } catch {
    return []
  }
}

export function saveConversations(convs: Conversation[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CONV_KEY, JSON.stringify(convs))
  } catch {}
}

export function loadActiveConvId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

export function saveActiveConvId(id: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ACTIVE_KEY, id)
  } catch {}
}

// ─────────────────────────── Cloud API (logged-in mode) ───────────────────

export async function loadConversationsAsync(): Promise<Conversation[]> {
  try {
    const res = await fetch('/api/conversations')
    if (!res.ok) {
      // Fallback to localStorage if API fails
      return loadConversations()
    }
    return await res.json()
  } catch {
    return loadConversations()
  }
}

export async function saveConversationToCloud(conv: Conversation): Promise<void> {
  try {
    await fetch(`/api/conversations/${conv.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: conv.title, projectState: conv.projectState }),
    })
  } catch {}
}

export async function createConversationInCloud(conv: Conversation): Promise<void> {
  try {
    await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conv),
    })
  } catch {}
}

export async function deleteConversationFromCloud(id: string): Promise<void> {
  try {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
  } catch {}
}
