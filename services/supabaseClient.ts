
import { createClient } from '@supabase/supabase-js';

// Prioriza variáveis de ambiente (Vercel/Local .env)
// Se não encontrar, usa as chaves que você forneceu como fallback para o app não crashar.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://htmdzgykgdrhepkpjtdx.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_6mUK1TBbIJ_r4cZbphN55A_xJiNuStr';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const isSupabaseConfigured = () => {
  // Retorna verdadeiro se as chaves não forem os placeholders genéricos
  return SUPABASE_URL !== 'https://placeholder.supabase.co' && SUPABASE_ANON_KEY !== 'placeholder';
};
