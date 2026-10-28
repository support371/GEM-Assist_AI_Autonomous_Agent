/**
 * GEM Storage Adapter
 * Provides window.storage.{get,set,delete,list} with two backends:
 *   1. Supabase (when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set)
 *   2. localStorage fallback (zero config, works offline)
 *
 * Supabase schema expected: table `kv` with columns (key text pk, value jsonb, updated_at timestamptz)
 * See supabase/schema.sql
 */
import { createClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let sb = null;
if (SB_URL && SB_KEY) {
  sb = createClient(SB_URL, SB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

const localAdapter = {
  async get(k) { const v = localStorage.getItem(k); return v ? { value: v } : null; },
  async set(k, v) { localStorage.setItem(k, v); return true; },
  async delete(k) { localStorage.removeItem(k); return true; },
  async list(prefix) {
    const keys = Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix));
    return { keys };
  },
};

// Supabase returns {data, error} — error must become a throw so wrap() falls back.
const check = (res, op) => { if (res.error) throw new Error(`[sb ${op}] ${res.error.message || res.error}`); return res; };

const sbAdapter = {
  async get(k) {
    const { data } = check(await sb.from('kv').select('value').eq('key', k).maybeSingle(), 'get');
    return data ? { value: typeof data.value === 'string' ? data.value : JSON.stringify(data.value) } : null;
  },
  async set(k, v) {
    const parsed = (() => { try { return JSON.parse(v); } catch { return v; } })();
    check(await sb.from('kv').upsert({ key: k, value: parsed, updated_at: new Date().toISOString() }), 'set');
    return true;
  },
  async delete(k) {
    check(await sb.from('kv').delete().eq('key', k), 'delete');
    return true;
  },
  async list(prefix) {
    const q = sb.from('kv').select('key');
    const { data } = check(prefix ? await q.like('key', `${prefix}%`) : await q, 'list');
    return { keys: (data || []).map(r => r.key) };
  },
};

// ─── Cross-tab sync via BroadcastChannel ───
// Any write broadcasts the key; other tabs re-fetch that key from Supabase.
// On single-tab or BC-unavailable, this is a no-op.
let bc = null;
try { bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('gem-taskade') : null; } catch { bc = null; }

export function broadcastKey(key) {
  try { bc?.postMessage({ type: 'kv:change', key, ts: Date.now() }); } catch {}
}

export function onKeyChange(handler) {
  if (!bc) return () => {};
  const fn = (ev) => { if (ev.data?.type === 'kv:change') handler(ev.data.key); };
  bc.addEventListener('message', fn);
  return () => bc.removeEventListener('message', fn);
}

export function installStorage() {
  // Resilient wrapper: tries Supabase first, falls back to localStorage on any error
  // (both thrown exceptions AND returned {error} responses — see check() above).
  const primary = sb ? sbAdapter : localAdapter;
  const fallback = localAdapter;
  const wrap = (method) => async (...args) => {
    try {
      const result = await primary[method](...args);
      if ((method === 'set' || method === 'delete') && args[0]) broadcastKey(args[0]);
      return result;
    } catch (err) {
      console.warn(`[storage] primary ${method} fell back:`, err?.message || err);
      return await fallback[method](...args);
    }
  };
  window.storage = {
    get: wrap('get'),
    set: wrap('set'),
    delete: wrap('delete'),
    list: wrap('list'),
    onKeyChange,  // Lets App.jsx subscribe to cross-tab mutations.
  };
  window.__gem = { supabase: sb, backend: sb ? 'supabase' : 'local' };
}
