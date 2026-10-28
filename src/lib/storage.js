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

const sbAdapter = {
  async get(k) {
    const { data } = await sb.from('kv').select('value').eq('key', k).maybeSingle();
    return data ? { value: typeof data.value === 'string' ? data.value : JSON.stringify(data.value) } : null;
  },
  async set(k, v) {
    const parsed = (() => { try { return JSON.parse(v); } catch { return v; } })();
    const { error } = await sb.from('kv').upsert({ key: k, value: parsed, updated_at: new Date().toISOString() });
    return !error;
  },
  async delete(k) {
    const { error } = await sb.from('kv').delete().eq('key', k);
    return !error;
  },
  async list(prefix) {
    const q = sb.from('kv').select('key');
    const { data } = prefix ? await q.like('key', `${prefix}%`) : await q;
    return { keys: (data || []).map(r => r.key) };
  },
};

export function installStorage() {
  // Resilient wrapper: tries Supabase first, falls back to localStorage on any error
  const primary = sb ? sbAdapter : localAdapter;
  const fallback = localAdapter;
  const wrap = (method) => async (...args) => {
    try { return await primary[method](...args); }
    catch { return await fallback[method](...args); }
  };
  window.storage = {
    get: wrap('get'),
    set: wrap('set'),
    delete: wrap('delete'),
    list: wrap('list'),
  };
  window.__gem = { supabase: sb, backend: sb ? 'supabase' : 'local' };
}
