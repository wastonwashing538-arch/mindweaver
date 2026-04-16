'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react'
import { Conversation, ProjectState } from './types'
import {
  loadConversations,
  saveConversations,
  loadActiveConvId,
  saveActiveConvId,
  loadConversationsAsync,
  saveConversationToCloud,
  createConversationInCloud,
  deleteConversationFromCloud,
} from './storage'
import { useAuth } from './auth-context'

function makeNewConversation(): Conversation {
  const rootId = crypto.randomUUID()
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    projectState: {
      branches: {
        [rootId]: {
          id: rootId,
          title: '新对话',
          parentBranchId: null,
          forkAtMessageIndex: null,
          depth: 0,
          createdAt: now,
          messages: [],
          children: [],
        },
      },
      rootBranchId: rootId,
      activeBranchId: rootId,
    },
  }
}

function initGuestState(): { conversations: Conversation[]; activeConvId: string } {
  const saved = loadConversations()
  if (saved.length > 0) {
    const savedActiveId = loadActiveConvId()
    const validId = saved.find(c => c.id === savedActiveId) ? savedActiveId! : saved[0].id
    return { conversations: saved, activeConvId: validId }
  }
  const first = makeNewConversation()
  return { conversations: [first], activeConvId: first.id }
}

interface ConversationContextValue {
  conversations: Conversation[]
  activeConvId: string
  isHydrating: boolean
  getActiveConv: () => Conversation | undefined
  switchConversation: (id: string) => void
  createConversation: () => void
  deleteConversation: (id: string) => void
  syncProjectState: (state: ProjectState) => void
  updateTitle: (convId: string, title: string) => void
}

const ConversationContext = createContext<ConversationContextValue | null>(null)

// Debounce helper
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}

export function ConversationProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn, isLoading: authLoading } = useAuth()
  const [{ conversations, activeConvId }, setState] = useState(initGuestState)
  const [isHydrating, setIsHydrating] = useState(true)
  const convsRef = useRef(conversations)
  convsRef.current = conversations
  const isLoggedInRef = useRef(isLoggedIn)
  isLoggedInRef.current = isLoggedIn

  // Hydrate from cloud when auth resolves
  useEffect(() => {
    if (authLoading) return

    if (!isLoggedIn) {
      // Guest mode: data already loaded synchronously from localStorage
      setIsHydrating(false)
      return
    }

    // Logged-in mode: fetch from cloud
    setIsHydrating(true)
    loadConversationsAsync().then(cloudConvs => {
      if (cloudConvs.length > 0) {
        const savedActiveId = loadActiveConvId()
        const validId = cloudConvs.find(c => c.id === savedActiveId)
          ? savedActiveId!
          : cloudConvs[0].id
        setState({ conversations: cloudConvs, activeConvId: validId })
      } else {
        // New user with no cloud data — keep current state (may be migrated guest data)
        // If also no local data, create a fresh conversation
        if (convsRef.current.length === 0) {
          const first = makeNewConversation()
          setState({ conversations: [first], activeConvId: first.id })
          createConversationInCloud(first)
        }
      }
      setIsHydrating(false)
    })
  }, [isLoggedIn, authLoading])

  // Debounced cloud save for syncProjectState (called on every token during streaming)
  const debouncedCloudSave = useRef(
    debounce((conv: Conversation) => {
      saveConversationToCloud(conv)
    }, 600)
  ).current

  const getActiveConv = useCallback(() => {
    return convsRef.current.find(c => c.id === activeConvId)
  }, [activeConvId])

  const switchConversation = useCallback((id: string) => {
    setState(prev => {
      saveActiveConvId(id)
      return { ...prev, activeConvId: id }
    })
  }, [])

  const createConversation = useCallback(() => {
    // If there's already an empty unused conversation, just switch to it
    const existingEmpty = convsRef.current.find(c => {
      const rootBranch = c.projectState.branches[c.projectState.rootBranchId]
      const branchCount = Object.keys(c.projectState.branches).length
      return rootBranch && rootBranch.messages.length === 0 && branchCount === 1
    })
    if (existingEmpty) {
      setState(prev => {
        saveActiveConvId(existingEmpty.id)
        return { ...prev, activeConvId: existingEmpty.id }
      })
      return
    }

    const newConv = makeNewConversation()
    setState(prev => {
      const next = [newConv, ...prev.conversations]
      saveConversations(next)
      saveActiveConvId(newConv.id)
      if (isLoggedInRef.current) {
        createConversationInCloud(newConv)
      }
      return { conversations: next, activeConvId: newConv.id }
    })
  }, [])

  const deleteConversation = useCallback((id: string) => {
    setState(prev => {
      const next = prev.conversations.filter(c => c.id !== id)
      const final = next.length > 0 ? next : [makeNewConversation()]
      saveConversations(final)
      const newActiveId = prev.activeConvId === id ? final[0].id : prev.activeConvId
      saveActiveConvId(newActiveId)
      if (isLoggedInRef.current) {
        deleteConversationFromCloud(id)
        // If we created a replacement conversation, also persist it
        if (next.length === 0) {
          createConversationInCloud(final[0])
        }
      }
      return { conversations: final, activeConvId: newActiveId }
    })
  }, [])

  const syncProjectState = useCallback((state: ProjectState) => {
    setState(prev => {
      const next = prev.conversations.map(c =>
        c.id === prev.activeConvId
          ? { ...c, projectState: state, updatedAt: Date.now() }
          : c
      )
      saveConversations(next)
      if (isLoggedInRef.current) {
        const updated = next.find(c => c.id === prev.activeConvId)
        if (updated) debouncedCloudSave(updated)
      }
      return { ...prev, conversations: next }
    })
  }, [debouncedCloudSave])

  const updateTitle = useCallback((convId: string, title: string) => {
    setState(prev => {
      const next = prev.conversations.map(c =>
        c.id === convId ? { ...c, title } : c
      )
      saveConversations(next)
      if (isLoggedInRef.current) {
        const updated = next.find(c => c.id === convId)
        if (updated) saveConversationToCloud(updated)
      }
      return { ...prev, conversations: next }
    })
  }, [])

  return (
    <ConversationContext.Provider value={{
      conversations,
      activeConvId,
      isHydrating,
      getActiveConv,
      switchConversation,
      createConversation,
      deleteConversation,
      syncProjectState,
      updateTitle,
    }}>
      {children}
    </ConversationContext.Provider>
  )
}

export function useConversation() {
  const ctx = useContext(ConversationContext)
  if (!ctx) throw new Error('useConversation must be used within ConversationProvider')
  return ctx
}
