'use client'

import { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'
import { Branch, Message, ProjectState } from './types'

type Action =
  | { type: 'SET_ACTIVE_BRANCH'; branchId: string }
  | { type: 'ADD_MESSAGE'; branchId: string; message: Message }
  | { type: 'UPDATE_LAST_MESSAGE'; branchId: string; content: string }
  | { type: 'TRIM_MESSAGES'; branchId: string; toIndex: number }
  | { type: 'CREATE_BRANCH'; parentBranchId: string; forkAtMessageIndex: number; newBranch: Branch }
  | { type: 'FORK'; parentBranchId: string; forkAtMessageIndex: number; childA: Branch; childB: Branch }
  | { type: 'SET_BRANCH_TITLE'; branchId: string; title: string }
  | { type: 'DELETE_BRANCH'; branchId: string }
  | { type: 'RESET' }

function reducer(state: ProjectState, action: Action): ProjectState {
  switch (action.type) {
    case 'SET_ACTIVE_BRANCH':
      return { ...state, activeBranchId: action.branchId }

    case 'ADD_MESSAGE': {
      const branch = state.branches[action.branchId]
      return {
        ...state,
        branches: {
          ...state.branches,
          [action.branchId]: {
            ...branch,
            messages: [...branch.messages, action.message],
          },
        },
      }
    }

    case 'TRIM_MESSAGES': {
      const branch = state.branches[action.branchId]
      return {
        ...state,
        branches: {
          ...state.branches,
          [action.branchId]: { ...branch, messages: branch.messages.slice(0, action.toIndex) },
        },
      }
    }

    case 'UPDATE_LAST_MESSAGE': {
      const branch = state.branches[action.branchId]
      const messages = [...branch.messages]
      messages[messages.length - 1] = {
        ...messages[messages.length - 1],
        content: action.content,
      }
      return {
        ...state,
        branches: {
          ...state.branches,
          [action.branchId]: { ...branch, messages },
        },
      }
    }

    case 'CREATE_BRANCH': {
      const parent = state.branches[action.parentBranchId]
      const newBranch: Branch = {
        ...action.newBranch,
        depth: parent.depth + 1,
        createdAt: Date.now(),
      }
      return {
        ...state,
        activeBranchId: newBranch.id,
        branches: {
          ...state.branches,
          [action.parentBranchId]: {
            ...parent,
            children: [...parent.children, newBranch.id],
          },
          [newBranch.id]: newBranch,
        },
      }
    }

    case 'FORK': {
      const parent = state.branches[action.parentBranchId]
      const depth = parent.depth + 1
      const childA: Branch = { ...action.childA, depth, createdAt: action.childA.createdAt }
      const childB: Branch = { ...action.childB, depth, createdAt: action.childB.createdAt }
      return {
        ...state,
        activeBranchId: childA.id,
        branches: {
          ...state.branches,
          [action.parentBranchId]: {
            ...parent,
            children: [...parent.children, childA.id, childB.id],
          },
          [childA.id]: childA,
          [childB.id]: childB,
        },
      }
    }

    case 'SET_BRANCH_TITLE': {
      const branch = state.branches[action.branchId]
      return {
        ...state,
        branches: {
          ...state.branches,
          [action.branchId]: { ...branch, title: action.title },
        },
      }
    }

    case 'DELETE_BRANCH': {
      const { branchId } = action
      const branch = state.branches[branchId]
      // Only delete leaf branches; don't delete the last remaining branch
      if (!branch || branch.children.length > 0) return state
      if (Object.keys(state.branches).length <= 1) return state

      const newBranches = { ...state.branches }
      delete newBranches[branchId]

      // Remove from parent's children list
      if (branch.parentBranchId && newBranches[branch.parentBranchId]) {
        const parent = newBranches[branch.parentBranchId]
        newBranches[branch.parentBranchId] = {
          ...parent,
          children: parent.children.filter(id => id !== branchId),
        }
      }

      // Pick new active branch if the deleted one was active
      let newActiveBranchId = state.activeBranchId
      if (state.activeBranchId === branchId) {
        if (branch.parentBranchId && newBranches[branch.parentBranchId]) {
          const updatedParent = newBranches[branch.parentBranchId]
          // If parent now has no children it becomes the active leaf; else pick first sibling
          newActiveBranchId = updatedParent.children.length === 0
            ? branch.parentBranchId
            : updatedParent.children[0]
        } else {
          newActiveBranchId = state.rootBranchId
        }
      }

      return { ...state, branches: newBranches, activeBranchId: newActiveBranchId }
    }

    case 'RESET': {
      const rootId = crypto.randomUUID()
      const root: Branch = {
        id: rootId,
        title: '新对话',
        parentBranchId: null,
        forkAtMessageIndex: null,
        depth: 0,
        createdAt: Date.now(),
        messages: [],
        children: [],
      }
      return { branches: { [rootId]: root }, rootBranchId: rootId, activeBranchId: rootId }
    }

    default:
      return state
  }
}

function createInitialState(initialState?: ProjectState): ProjectState {
  if (initialState) return initialState
  const rootId = 'root'
  const root: Branch = {
    id: rootId,
    title: '新对话',
    parentBranchId: null,
    forkAtMessageIndex: null,
    depth: 0,
    createdAt: Date.now(),
    messages: [],
    children: [],
  }
  return {
    branches: { [rootId]: root },
    rootBranchId: rootId,
    activeBranchId: rootId,
  }
}

// Build the full message context for AI calls (recursively follows parent chain)
export function buildContext(
  branchId: string,
  branches: Record<string, Branch>,
  upToIndex?: number
): Message[] {
  const branch = branches[branchId]
  const ownMessages: Message[] =
    upToIndex !== undefined
      ? branch.messages.slice(0, upToIndex + 1)
      : branch.messages

  if (!branch.parentBranchId) {
    return ownMessages
  }

  const parentMessages = buildContext(
    branch.parentBranchId,
    branches,
    branch.forkAtMessageIndex ?? undefined
  )

  return [...parentMessages, ...ownMessages]
}

interface BranchContextValue {
  state: ProjectState
  dispatch: React.Dispatch<Action>
}

const BranchContext = createContext<BranchContextValue | null>(null)

interface BranchProviderProps {
  children: ReactNode
  initialState?: ProjectState
  onStateChange?: (state: ProjectState) => void
}

export function BranchProvider({ children, initialState, onStateChange }: BranchProviderProps) {
  const [state, dispatch] = useReducer(
    reducer,
    initialState,
    createInitialState
  )

  useEffect(() => {
    onStateChange?.(state)
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BranchContext.Provider value={{ state, dispatch }}>
      {children}
    </BranchContext.Provider>
  )
}

export function useBranch() {
  const ctx = useContext(BranchContext)
  if (!ctx) throw new Error('useBranch must be used within BranchProvider')
  return ctx
}
