/**
 * GEM Taskade · auth bootstrap
 *
 * On every page load, ensure the viewer has a Supabase session so RLS
 * works and agent facts are scoped per visitor rather than per global
 * 'anonymous' key. Flow:
 *   1. Try to restore an existing session from localStorage (handled by
 *      createClient's persistSession option).
 *   2. If none, signInAnonymously() — gives a durable uuid per browser.
 *   3. Expose currentUserId() and onAuthChange() for the SPA.
 *
 * When Supabase is not configured (SB=null in storage.js), this falls
 * back to a stable device uuid in localStorage so agent userIds still
 * differ between browsers.
 */

const DEVICE_ID_KEY = 'gem.device_id';

function deviceId() {
  try {
    let v = localStorage.getItem(DEVICE_ID_KEY);
    if (!v) {
      v = (crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
      localStorage.setItem(DEVICE_ID_KEY, v);
    }
    return v;
  } catch {
    return 'anonymous';
  }
}

let currentId = null;
let supabase = null;
const listeners = new Set();

export async function initAuth(sb) {
  supabase = sb;
  if (!supabase) {
    currentId = deviceId();
    return currentId;
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      currentId = session.user.id;
    } else {
      // Anonymous sign-in requires Supabase project to enable anonymous auth
      // (Project Settings → Authentication → Sign In / Up → "Enable anonymous sign-ins").
      // If disabled, we fall back to a stable device id.
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.warn('[auth] anonymous sign-in disabled, using device id:', error.message);
        currentId = deviceId();
      } else {
        currentId = data.user?.id || deviceId();
      }
    }
    supabase.auth.onAuthStateChange((_evt, session) => {
      currentId = session?.user?.id || deviceId();
      listeners.forEach(fn => { try { fn(currentId); } catch {} });
    });
  } catch (err) {
    console.warn('[auth] init failed, using device id:', err?.message || err);
    currentId = deviceId();
  }
  return currentId;
}

export function currentUserId() {
  return currentId || deviceId();
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Upgrade to a real identity via magic link. Returns true if request sent. */
export async function sendMagicLink(email) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
  return true;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
