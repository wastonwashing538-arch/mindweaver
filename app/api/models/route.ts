import { createAdminClient } from '@/lib/supabase/admin'

export const preferredRegion = ['hkg1', 'sin1']

interface PublicModel {
  id: string
  display_name: string
  tier_required: 'free' | 'vip'
  description: string | null
  sort_order: number
}

const DEFAULT_MODELS: PublicModel[] = [
  { id: 'deepseek-r1', display_name: 'DeepSeek R1', tier_required: 'free', description: '免费用户专属，深度推理', sort_order: 1 },
]

let cache: { data: PublicModel[]; expiresAt: number } = { data: DEFAULT_MODELS, expiresAt: 0 }

export async function GET() {
  if (Date.now() < cache.expiresAt) {
    return Response.json(cache.data)
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('ai_models')
        .select('id, display_name, tier_required, description, sort_order')
        .eq('is_active', true)
        .order('sort_order')

      if (!error && data?.length) {
        cache = { data, expiresAt: Date.now() + 5 * 60 * 1000 }
        return Response.json(data)
      }
    } catch {}
  }

  return Response.json(DEFAULT_MODELS)
}
