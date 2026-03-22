import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const teamSecret = import.meta.env.VITE_SUPABASE_TEAM_SECRET;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[XoCompass] Supabase not configured — falling back to localStorage.\n' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable cloud sync.'
  );
}

// Phase 1 RLS Hardening: pass x-team-secret header on every request.
// This header is checked by the team_secret_matches() SQL function in RLS policies.
// Reads are open; writes require the secret to match the DB-side app setting.
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: teamSecret ? { 'x-team-secret': teamSecret } : {},
      },
    })
  : null;

export const isCloudEnabled = !!supabase;

/**
 * Fetch a user's profile from the profiles table.
 * @param {string} userId - The auth.users UUID
 * @returns {Promise<{id,email,name,role,avatar_url,created_at}|null>}
 */
export async function fetchProfile(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) {
    console.error('[XoCompass] fetchProfile:', error.message);
    return null;
  }
  return data;
}
