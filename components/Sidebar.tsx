'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Network, List, Clock, Plus, ArrowLeft, Trash2, LogIn, Settings } from 'lucide-react'
import { useBranch } from '@/lib/branch-context'
import { useConversation } from '@/lib/conversation-context'
import { useAuth } from '@/lib/auth-context'
import { Branch, Conversation } from '@/lib/types'

// ─────────────────────────── Color scheme ─────────────────────────────────

type DepthLevel = { bg: string; text: string; muted: string }

const SCHEME = {
  ring: '#5D4037',
  levels: [
    { bg: '#5D4037', text: '#FFFFFF', muted: 'rgba(255,255,255,0.50)' },
    { bg: '#8B5A2B', text: '#FFFFFF', muted: 'rgba(255,255,255,0.50)' },
    { bg: '#BCAAA4', text: '#3E2723', muted: '#8D6E63' },
    { bg: '#D7CCC8', text: '#3E2723', muted: '#A1887F' },
    { bg: '#F5F5F5', text: '#4E342E', muted: '#BDBDBD' },
  ] as DepthLevel[],
}

function getLevel(depth: number): DepthLevel {
  return SCHEME.levels[Math.min(depth, 4)]
}

// ─────────────────────────── Capsule constants ────────────────────────────

const CAPSULE_H = 56
const CAPSULE_WIDTH = 256

function capsuleLabel(branch: Branch, isActive: boolean): string {
  if (branch.messages.length === 0) return isActive ? 'typing in' : 'not typed yet'
  return branch.title
}

// ─────────────────────────── Tree layout ──────────────────────────────────

const NODE_H = 40
const H_GAP = 28
const V_GAP = 56
const TREE_PAD = 32

interface NodePos { cx: number; y: number }

function countLeaves(id: string, branches: Record<string, Branch>): number {
  const b = branches[id]
  if (!b) return 0
  if (b.children.length === 0) return 1
  return b.children.reduce((sum, cid) => sum + countLeaves(cid, branches), 0)
}

function subtreeWidth(id: string, branches: Record<string, Branch>, nodeW: number): number {
  const b = branches[id]
  if (!b || b.children.length === 0) return nodeW
  const w = b.children.reduce(
    (sum, cid) => sum + subtreeWidth(cid, branches, nodeW) + H_GAP,
    -H_GAP
  )
  return Math.max(nodeW, w)
}

function buildPositions(
  id: string,
  branches: Record<string, Branch>,
  left: number,
  top: number,
  out: Map<string, NodePos>,
  nodeW: number
) {
  const b = branches[id]
  if (!b) return
  const sw = subtreeWidth(id, branches, nodeW)
  out.set(id, { cx: left + sw / 2, y: top })
  let childLeft = left
  for (const cid of b.children) {
    buildPositions(cid, branches, childLeft, top + NODE_H + V_GAP, out, nodeW)
    childLeft += subtreeWidth(cid, branches, nodeW) + H_GAP
  }
}

function computeAutoTreeWidth(branches: Record<string, Branch>, rootBranchId: string): number {
  const leaves = countLeaves(rootBranchId, branches)
  const targetNodeW = 110
  const contentW = leaves * targetNodeW + Math.max(0, leaves - 1) * H_GAP + TREE_PAD * 2
  return Math.max(220, Math.min(720, contentW))
}

// ─────────────────────────── TreeView ─────────────────────────────────────

interface TreeViewProps {
  branches: Record<string, Branch>
  rootBranchId: string
  activeBranchId: string
  onSelect: (id: string) => void
  panelWidth: number
}

function TreeView({ branches, rootBranchId, activeBranchId, onSelect, panelWidth }: TreeViewProps) {
  const nodeW = useMemo(() => {
    const leaves = countLeaves(rootBranchId, branches)
    const available = panelWidth - TREE_PAD * 2
    const ideal = (available - Math.max(0, leaves - 1) * H_GAP) / Math.max(leaves, 1)
    return Math.max(80, Math.min(160, Math.round(ideal)))
  }, [rootBranchId, branches, panelWidth])

  const positions = useMemo(() => {
    const pos = new Map<string, NodePos>()
    buildPositions(rootBranchId, branches, 0, 0, pos, nodeW)
    return pos
  }, [branches, rootBranchId, nodeW])

  const allPos = [...positions.values()]
  if (allPos.length === 0) return null

  const canvasW = Math.max(...allPos.map(p => p.cx)) + nodeW / 2
  const canvasH = Math.max(...allPos.map(p => p.y)) + NODE_H

  const edgeLines: React.ReactNode[] = []
  for (const [id, pos] of positions) {
    const b = branches[id]
    if (!b || b.children.length === 0) continue
    const childPos = b.children.map(cid => positions.get(cid)).filter(Boolean) as NodePos[]
    const midY = pos.y + NODE_H + V_GAP / 2
    edgeLines.push(
      <line key={`${id}-pv`} x1={pos.cx} y1={pos.y + NODE_H} x2={pos.cx} y2={midY}
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    )
    if (childPos.length > 1) {
      edgeLines.push(
        <line key={`${id}-h`} x1={childPos[0].cx} y1={midY}
          x2={childPos[childPos.length - 1].cx} y2={midY}
          stroke="currentColor" strokeWidth="1.5" />
      )
    }
    childPos.forEach((cp, i) => {
      edgeLines.push(
        <line key={`${id}-cv${i}`} x1={cp.cx} y1={midY} x2={cp.cx} y2={cp.y}
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )
    })
  }

  return (
    <div className="w-full h-full overflow-auto">
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        minWidth: '100%', minHeight: '100%',
        padding: `${TREE_PAD}px`, boxSizing: 'border-box',
      }}>
        <div style={{ position: 'relative', width: canvasW, height: canvasH, flexShrink: 0 }}>
          <svg className="text-neutral-600"
            style={{ position: 'absolute', inset: 0, width: canvasW, height: canvasH, pointerEvents: 'none' }}>
            {edgeLines}
          </svg>
          {[...positions.entries()].map(([id, pos]) => {
            const b = branches[id]
            if (!b) return null
            const isActive = id === activeBranchId
            const level = getLevel(b.depth)
            const isEmpty = b.messages.length === 0
            return (
              <div key={id} onClick={() => onSelect(id)} title={isEmpty ? '' : b.title}
                style={{
                  position: 'absolute',
                  left: pos.cx - nodeW / 2, top: pos.y,
                  width: nodeW, height: NODE_H,
                  backgroundColor: level.bg, borderRadius: 8,
                  border: isActive ? `2px solid ${SCHEME.ring}` : '1.5px solid rgba(0,0,0,0.10)',
                  boxSizing: 'border-box', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', padding: '0 10px', userSelect: 'none',
                }}>
                <span style={{
                  fontSize: 11,
                  color: isEmpty ? level.muted : level.text,
                  fontStyle: isEmpty ? 'italic' : 'normal',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%',
                }}>
                  {isEmpty ? 'not typed yet' : b.title}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── History list ─────────────────────────────────

function groupByDate(convs: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const weekAgo = today - 7 * 86400000

  const groups: Record<string, Conversation[]> = { '今天': [], '昨天': [], '最近7天': [], '更早': [] }
  for (const c of convs) {
    if (c.updatedAt >= today) groups['今天'].push(c)
    else if (c.updatedAt >= yesterday) groups['昨天'].push(c)
    else if (c.updatedAt >= weekAgo) groups['最近7天'].push(c)
    else groups['更早'].push(c)
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))
}

interface HistoryListProps {
  conversations: Conversation[]
  activeConvId: string
  onSwitch: (id: string) => void
  onDelete: (id: string) => void
  onBack: () => void
}

function HistoryList({ conversations, activeConvId, onSwitch, onDelete, onBack }: HistoryListProps) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
  const groups = groupByDate(sorted)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })

  // Compute a global index offset per group for staggered animation
  const groupsWithOffset = (() => {
    let offset = 0
    return groups.map(g => {
      const startOffset = offset
      offset += g.items.length
      return { ...g, startOffset }
    })
  })()

  useEffect(() => {
    if (!menuId) return
    function close(e: MouseEvent | KeyboardEvent) {
      if ('key' in e && e.key !== 'Escape') return
      setMenuId(null)
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', close) }
  }, [menuId])

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Back header */}
      <div className="px-3 py-2 border-b border-neutral-800 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <ArrowLeft size={12} />
          返回
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {groupsWithOffset.map(({ label, items, startOffset }) => (
          <div key={label}>
            <p className="px-2 py-1 text-[10px] text-neutral-600 uppercase tracking-widest select-none">{label}</p>
            <div className="space-y-0.5">
              {items.map((conv, i) => {
                const isActive = conv.id === activeConvId
                return (
                  <div
                    key={conv.id}
                    onContextMenu={e => {
                      e.preventDefault()
                      setMenuId(conv.id)
                      setMenuPos({ x: e.clientX, y: e.clientY })
                    }}
                    onClick={() => onSwitch(conv.id)}
                    style={{
                      borderRadius: 8,
                      border: isActive ? `1.5px solid ${SCHEME.ring}` : '1.5px solid transparent',
                      backgroundColor: isActive ? 'rgba(93,64,55,0.15)' : 'transparent',
                      cursor: 'pointer',
                      padding: '6px 10px',
                      transition: 'background-color 120ms ease',
                      animation: 'historyItemEnter 220ms ease-out both',
                      animationDelay: `${(startOffset + i) * 30}ms`,
                    }}
                    className="hover:bg-neutral-800/60"
                  >
                    <p className="text-xs text-neutral-300 truncate leading-snug">
                      {conv.title}
                    </p>
                    <p className="text-[10px] text-neutral-600 mt-0.5">
                      {new Date(conv.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Context menu */}
      {menuId && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: menuPos.x,
            top: menuPos.y,
            zIndex: 200,
            backgroundColor: '#2C1F16',
            border: '1px solid #3D2B1F',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
            padding: '4px 0',
            minWidth: 120,
          }}
        >
          <button
            onClick={() => { onDelete(menuId); setMenuId(null) }}
            className="w-full px-3 py-1.5 text-xs text-left flex items-center gap-2 transition-colors"
            style={{ color: '#f87171' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#3D2B1F')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Trash2 size={11} />
            删除对话
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────── Drag constants ───────────────────────────────

const TREE_SNAP_THRESHOLD = 80

// ─────────────────────────── Sidebar ──────────────────────────────────────

export function Sidebar() {
  const { state, dispatch } = useBranch()
  const { conversations, activeConvId, switchConversation, createConversation, deleteConversation } = useConversation()
  const { isLoggedIn } = useAuth()
  const router = useRouter()
  const [view, setView] = useState<'capsule' | 'history'>('capsule')
  const [treeWidth, setTreeWidth] = useState(0)
  const [transitionEnabled, setTransitionEnabled] = useState(false)
  const [isAutoExpanded, setIsAutoExpanded] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ branchId: string; x: number; y: number } | null>(null)

  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  const treeWidthRef = useRef(0)

  useEffect(() => { treeWidthRef.current = treeWidth }, [treeWidth])

  // Auto-resize tree when branch count changes (only in auto-expand mode)
  const branchCount = Object.keys(state.branches).length
  useEffect(() => {
    if (!isAutoExpanded) return
    const newWidth = computeAutoTreeWidth(state.branches, state.rootBranchId)
    setTransitionEnabled(true)
    setTreeWidth(newWidth)
  }, [branchCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return
    function handleClose(e: MouseEvent | KeyboardEvent) {
      if ('key' in e && e.key !== 'Escape') return
      setContextMenu(null)
    }
    document.addEventListener('click', handleClose)
    document.addEventListener('keydown', handleClose)
    return () => {
      document.removeEventListener('click', handleClose)
      document.removeEventListener('keydown', handleClose)
    }
  }, [contextMenu])

  const showTree = treeWidth >= TREE_SNAP_THRESHOLD
  const treeOpacity = showTree ? Math.min(1, (treeWidth - TREE_SNAP_THRESHOLD) / 60 + 0.3) : 0
  const asideWidth = showTree ? CAPSULE_WIDTH + treeWidth : CAPSULE_WIDTH

  const leaves = Object.values(state.branches)
    .filter(b => b.children.length === 0)
    .sort((a, b) => a.createdAt - b.createdAt)

  // ── Toggle tree view ──

  function handleToggleTree() {
    setTransitionEnabled(true)
    if (showTree) {
      setTreeWidth(0)
      setIsAutoExpanded(false)
    } else {
      const autoWidth = computeAutoTreeWidth(state.branches, state.rootBranchId)
      setTreeWidth(autoWidth)
      setIsAutoExpanded(true)
    }
  }

  // ── Delete branch ──

  function handleDelete(branchId: string) {
    dispatch({ type: 'DELETE_BRANCH', branchId })
    setContextMenu(null)
  }

  // ── Drag logic ──

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return
    const delta = e.clientX - dragStartX.current
    setTreeWidth(Math.max(0, dragStartWidth.current + delta))
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    if (treeWidthRef.current < TREE_SNAP_THRESHOLD) {
      setTransitionEnabled(true)
      setTreeWidth(0)
      setIsAutoExpanded(false)
    }
  }, [handleMouseMove])

  function handleDragHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    isDragging.current = true
    setIsAutoExpanded(false)    // user takes manual control
    setTransitionEnabled(false) // no transition during drag
    dragStartX.current = e.clientX
    dragStartWidth.current = treeWidthRef.current
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return (
    <aside
      style={{
        width: `${asideWidth}px`,
        transition: transitionEnabled ? 'width 240ms cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
      }}
      className="relative shrink-0 bg-neutral-900 border-r border-neutral-800 h-full flex flex-col"
      onTransitionEnd={() => setTransitionEnabled(false)}
    >

      {/* ── Header: MindWeaver logo + action buttons ── */}
      <div className="px-4 py-3 border-b border-neutral-800 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2 select-none">
          <img src="/logo.png" alt="MindWeaver" className="w-6 h-6 rounded-md object-cover shrink-0" />
          <span
            className="text-neutral-300"
            style={{
              fontFamily: 'var(--font-brand), Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: '1.05rem',
              letterSpacing: '0.01em',
            }}
          >
            MindWeaver
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={createConversation}
            title="新建对话"
            className="w-6 h-6 rounded flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700 transition-all duration-150"
          >
            <Plus size={13} strokeWidth={2} />
          </button>
          <button
            onClick={() => setView(v => v === 'history' ? 'capsule' : 'history')}
            title={view === 'history' ? '返回' : '历史记录'}
            className={`w-6 h-6 rounded flex items-center justify-center transition-all duration-150 ${
              view === 'history'
                ? 'text-neutral-200 bg-neutral-700'
                : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700'
            }`}
          >
            <Clock size={13} strokeWidth={1.8} />
          </button>
          {view !== 'history' && (
            <button
              onClick={handleToggleTree}
              title={showTree ? '收起树图' : '展开树图'}
              className="w-6 h-6 rounded flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700 transition-all duration-150"
            >
              {showTree
                ? <List size={13} strokeWidth={1.8} />
                : <Network size={13} strokeWidth={1.8} />
              }
            </button>
          )}
          <button
            onClick={() => router.push(isLoggedIn ? '/settings' : '/auth')}
            title={isLoggedIn ? '设置' : '登录'}
            className="w-6 h-6 rounded flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700 transition-all duration-150"
          >
            {isLoggedIn
              ? <Settings size={13} strokeWidth={1.8} />
              : <LogIn size={13} strokeWidth={1.8} />
            }
          </button>
        </div>
      </div>

      {/* ── History view ── */}
      {view === 'history' && (
        <HistoryList
          conversations={conversations}
          activeConvId={activeConvId}
          onSwitch={(id) => { switchConversation(id); setView('capsule') }}
          onDelete={deleteConversation}
          onBack={() => setView('capsule')}
        />
      )}

      {/* ── Capsule view ── */}
      {view !== 'history' && !showTree && (
        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {leaves.map((branch) => {
            const isActive = state.activeBranchId === branch.id
            const level = getLevel(branch.depth)
            const label = capsuleLabel(branch, isActive)
            const isEmpty = branch.messages.length === 0
            return (
              <div
                key={branch.id}
                style={{
                  padding: '3px',
                  borderRadius: `${CAPSULE_H / 2 + 3}px`,
                  border: isActive ? `1.5px solid ${SCHEME.ring}` : '1.5px solid transparent',
                  transition: 'border-color 150ms ease',
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ branchId: branch.id, x: e.clientX, y: e.clientY })
                }}
              >
                <button
                  onClick={() => dispatch({ type: 'SET_ACTIVE_BRANCH', branchId: branch.id })}
                  style={{
                    backgroundColor: level.bg,
                    borderRadius: `${CAPSULE_H / 2}px`,
                    height: `${CAPSULE_H}px`,
                  }}
                  className={`w-full flex items-center px-6 transition-opacity duration-150${!isActive ? ' hover:opacity-90' : ''}`}
                >
                  {isEmpty ? (
                    <span className="w-full text-center text-sm italic" style={{ color: level.muted }}>
                      {label}
                    </span>
                  ) : (
                    <span className="text-sm font-medium line-clamp-2 text-left" style={{ color: level.text }}>
                      {label}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </nav>
      )}

      {/* ── Tree view ── */}
      {view !== 'history' && showTree && (
        <div
          className="flex-1 overflow-hidden"
          style={{ opacity: treeOpacity, transition: 'opacity 100ms ease' }}
        >
          <TreeView
            branches={state.branches}
            rootBranchId={state.rootBranchId}
            activeBranchId={state.activeBranchId}
            onSelect={(id) => dispatch({ type: 'SET_ACTIVE_BRANCH', branchId: id })}
            panelWidth={asideWidth}
          />
        </div>
      )}

      {/* ── Drag handle (right edge) ── */}
      <div
        onMouseDown={handleDragHandleMouseDown}
        className="absolute top-0 bottom-0 right-0 w-2 cursor-col-resize z-10"
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      />

      {/* ── Right-click context menu ── */}
      {contextMenu && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 200,
            backgroundColor: '#2C1F16',
            border: '1px solid #3D2B1F',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
            padding: '4px 0',
            minWidth: 120,
          }}
        >
          {leaves.length > 1 ? (
            <button
              onClick={() => handleDelete(contextMenu.branchId)}
              className="w-full px-3 py-1.5 text-xs text-left transition-colors"
              style={{ color: '#f87171' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#3D2B1F')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              删除分支
            </button>
          ) : (
            <div className="px-3 py-1.5 text-xs" style={{ color: '#8A7A6C' }}>
              无法删除最后一个分支
            </div>
          )}
        </div>
      )}

    </aside>
  )
}
