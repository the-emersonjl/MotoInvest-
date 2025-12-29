
import { createClient } from '@supabase/supabase-js';

// As variáveis abaixo agora são injetadas pelo Vite via vite.config.ts
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://htmdzgykgdrhepkpjtdx.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_6mUK1TBbIJ_r4cZbphN55A_xJiNuStr';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const isSupabaseConfigured = () => {
  return SUPABASE_URL.includes('supabase.co') && !!SUPABASE_ANON_KEY;
};
