/**
 * GEM Taskade · Worker auth helpers
 *
 * Validates a Supabase user access token on inbound requests to /agent/*
 * and /llm, extracting the auth.users id. Public callers (no header, or
 * header that doesn't validate) are tagged as anonymous — their requests
 * still run but with a short, non-persistent per-request id and no access
 * to workspace-scoped knowledge.
 *
 * Verification is done via Supabase's REST /auth/v1/user endpoint rather
 * than local JWT signature validation to keep the Worker free of a JWT
 * library. The call is cheap and runs on every /agent/* turn.
 */

const PUBLIC_PATHS = new Set(['/', '/health', '/webhook']);

export function requiresAuth(path) {
  if (PUBLIC_PATHS.has(path)) return false;
  // /embed and /publish are admin-token-guarded (ADMIN_SECRET), not user JWT
  if (path === '/embed' || path === '/publish') return false;
  // /agent/:name and /llm require user auth (anonymous allowed, see verify)
  return path === '/llm' || path.startsWith('/agent/');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_TIMEOUT_MS = 4000;

async function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally { clearTimeout(t); }
}

/**
 * Extract and verify a Supabase JWT from the Authorization header.
 * Returns { userId, workspaceId } for a valid token with a verified-membership
 *   workspace, or workspaceId: null when the header is missing / not a UUID /
 *   not owned by the caller.
 * Returns { userId: null, workspaceId: null, anonymous: true } for no token
 * or an invalid one — callers decide whether to allow anonymous.
 */
export async function verifyAuth(request, env) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return { userId: null, workspaceId: null, anonymous: true };
  }
  const token = match[1];
  try {
    const res = await fetchWithTimeout(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return { userId: null, workspaceId: null, anonymous: true };
    const user = await res.json();
    const userId = user?.id || null;
    if (!userId) return { userId: null, workspaceId: null, anonymous: true };

    // Verify the x-gem-workspace header against actual ownership. A trusted
    // header value could otherwise let one user hand us another user's
    // workspace UUID and read their private knowledge.
    const requested = request.headers.get('x-gem-workspace') || null;
    const workspaceId = UUID_RE.test(requested || '')
      ? await verifyWorkspaceOwnership(env, userId, requested)
      : null;
    return { userId, workspaceId, anonymous: false };
  } catch (err) {
    console.error('[auth] verify failed:', err?.message || err);
    return { userId: null, workspaceId: null, anonymous: true };
  }
}

/**
 * Confirm the user owns the requested workspace. Service role bypasses RLS
 * so we filter on both ids. Returns the workspace id when verified, null
 * otherwise. Fails closed on any error.
 */
async function verifyWorkspaceOwnership(env, userId, workspaceId) {
  if (!env.SUPABASE_SERVICE_KEY) return null;
  try {
    const res = await fetchWithTimeout(
      `${env.SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}&owner_id=eq.${userId}&select=id`,
      { headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length === 1 ? workspaceId : null;
  } catch (err) {
    console.error('[auth] workspace verify failed:', err?.message || err);
    return null;
  }
}
