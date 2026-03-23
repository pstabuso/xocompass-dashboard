import { createClient } from '@supabase/supabase-js';

// ── Environment variables ──────────────────────────────────────────
// Only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are needed client-side.
// The anon key is public by design (Supabase RLS protects data).
// NEVER expose service_role keys or secrets in frontend code.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[XoCompass] Supabase not configured — falling back to localStorage.\n' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable cloud sync.'
  );
}

// Create Supabase client — auth engine disabled (we use custom Soft Auth).
// persistSession: false → Web Locks API never acquired for session storage,
//   eliminating the lock-contention timeout on desktop Chrome/Firefox.
// autoRefreshToken: false → no background polling for token refresh.
// detectSessionInUrl: false → no URL hash parsing on load (OAuth not used).
// Security relies on Supabase RLS policies + in-memory JWT for the active session.
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,     // kills Web Locks API usage — root-cause fix
        autoRefreshToken: false,   // stops background token-refresh polling
        detectSessionInUrl: false, // stops URL parsing for OAuth callbacks
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
    .select('id,email,name,role,avatar_url,created_at')
    .eq('id', userId)
    .single();
  if (error) {
    console.error('[XoCompass] fetchProfile:', error.message);
    return null;
  }
  return data;
}

/**
 * Fetch all profiles (admin only — RLS enforced server-side).
 * @returns {Promise<Array|null>}
 */
export async function fetchAllProfiles() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,name,role,avatar_url,created_at,updated_at')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[XoCompass] fetchAllProfiles:', error.message);
    return null;
  }
  return data;
}

/**
 * Update a user's role (admin action — RLS enforced server-side).
 * @param {string} userId
 * @param {string} newRole
 */
export async function updateUserRole(userId, newRole) {
  if (!supabase) return { error: 'Cloud not configured' };
  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);
  if (error) return { error: error.message };
  return { error: null };
}
