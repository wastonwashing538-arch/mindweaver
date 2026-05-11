import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Conversation } from '@/lib/types'

// GET /api/conversations — list all conversations for the current user
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at, project_state')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Map snake_case DB columns to camelCase TypeScript interface
  const conversations: Conversation[] = (data ?? []).map(row => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectState: row.project_state,
  }))

  return NextResponse.json(conversations)
}

const FREE_TIER_CONV_LIMIT = 50

// POST /api/conversations — create a new conversation
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Enforce conversation limit for free-tier users
  const { count } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if ((count ?? 0) >= FREE_TIER_CONV_LIMIT) {
    return NextResponse.json(
      { error: 'CONVERSATION_LIMIT_EXCEEDED', limit: FREE_TIER_CONV_LIMIT },
      { status: 429 }
    )
  }

  const conv: Conversation = await request.json()

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      id: conv.id,
      user_id: user.id,
      title: conv.title,
      created_at: conv.createdAt,
      updated_at: conv.updatedAt,
      project_state: conv.projectState,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
