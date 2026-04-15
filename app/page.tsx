'use client'

import { BranchProvider } from '@/lib/branch-context'
import { ConversationProvider, useConversation } from '@/lib/conversation-context'
import { Sidebar } from '@/components/Sidebar'
import { ChatArea } from '@/components/ChatArea'

function ConversationShell() {
  const { activeConvId, getActiveConv, syncProjectState, isHydrating } = useConversation()

  // Show skeleton while loading cloud data to prevent stale initialState
  if (isHydrating) {
    return (
      <div className="flex h-full">
        {/* Sidebar skeleton */}
        <div className="w-64 shrink-0 bg-neutral-900 border-r border-neutral-800 h-full flex flex-col">
          <div className="px-4 py-3 border-b border-neutral-800 shrink-0 flex items-center justify-between">
            <div className="h-5 w-24 rounded bg-neutral-800 animate-pulse" />
            <div className="flex gap-1">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-6 h-6 rounded bg-neutral-800 animate-pulse" />
              ))}
            </div>
          </div>
          <div className="p-3 flex flex-col gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 rounded-full bg-neutral-800 animate-pulse" />
            ))}
          </div>
        </div>
        {/* Chat area skeleton */}
        <div className="flex-1 bg-neutral-950" />
      </div>
    )
  }

  const initialState = getActiveConv()?.projectState

  return (
    <BranchProvider
      key={activeConvId}
      initialState={initialState}
      onStateChange={syncProjectState}
    >
      <div className="flex h-full">
        <Sidebar />
        <ChatArea />
      </div>
    </BranchProvider>
  )
}

export default function Home() {
  return (
    <ConversationProvider>
      <ConversationShell />
    </ConversationProvider>
  )
}
