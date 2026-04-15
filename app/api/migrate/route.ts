import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Conversation } from '@/lib/types'

// POST /api/migrate — bulk upsert localStorage conversations to Supabase
// Idempotent: uses upsert on id, safe to call multiple times
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const conversations: Conversation[] = await request.json()

  if (!Array.isArray(conversations) || conversations.length === 0) {
    return NextResponse.json({ migrated: 0 })
  }

  const rows = conversations.map(conv => ({
    id: conv.id,
    user_id: user.id,
    title: conv.title,
    created_at: conv.createdAt,
    updated_at: conv.updatedAt,
    project_state: conv.projectState,
  }))

  const { error } = await supabase
    .from('conversations')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ migrated: rows.length })
}
