
import { createClient } from '@supabase/supabase-js';

// Helper to safely get environment variables in different environments (Vite vs Browser/Node)
const getEnvVar = (key: string, fallback: string): string => {
  // Check process.env (common in CI and many environments)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  // Check import.meta.env (Vite specific)
  try {
    const metaEnv = (import.meta as any).env;
    if (metaEnv && metaEnv[key]) {
      return metaEnv[key];
    }
  } catch (e) {
    // import.meta might not be available in some environments
  }
  return fallback;
};

const SUPABASE_URL = getEnvVar('VITE_SUPABASE_URL', 'https://htmdzgykgdrhepkpjtdx.supabase.co');
const SUPABASE_ANON_KEY = getEnvVar('VITE_SUPABASE_ANON_KEY', 'sb_publishable_6mUK1TBbIJ_r4cZbphN55A_xJiNuStr');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const isSupabaseConfigured = () => {
  return SUPABASE_URL !== 'https://placeholder.supabase.co' && !!SUPABASE_ANON_KEY;
};
