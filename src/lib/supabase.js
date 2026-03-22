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

// Create Supabase client — no custom headers (they cause CORS preflight failures).
// Security relies on Supabase RLS policies + authenticated user JWT.
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
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
 * Log an auth event to the audit log.
 * @param {string} email
 * @param {string} eventType - sign_in_success|sign_in_failed|sign_up_success|sign_up_failed|sign_out|session_restored|restricted_blocked
 * @param {object} [metadata={}]
 */
export async function logAuthEvent(email, eventType, metadata = {}) {
  if (!supabase) return;
  try {
    await supabase.from('auth_audit_log').insert({
      email,
      event_type: eventType,
      user_agent: navigator.userAgent || null,
      metadata,
    });
  } catch {
    // Audit logging should never block the auth flow
  }
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

/**
 * Fetch auth audit log (admin only — RLS enforced server-side).
 * @param {number} [limit=100]
 * @returns {Promise<Array|null>}
 */
export async function fetchAuditLog(limit = 100) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('auth_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[XoCompass] fetchAuditLog:', error.message);
    return null;
  }
  return data;
}
