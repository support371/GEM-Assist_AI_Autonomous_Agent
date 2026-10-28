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

/**
 * Extract and verify a Supabase JWT from the Authorization header.
 * Returns { userId, workspaceId } for a valid token.
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
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return { userId: null, workspaceId: null, anonymous: true };
    const user = await res.json();
    const userId = user?.id || null;
    if (!userId) return { userId: null, workspaceId: null, anonymous: true };

    // Resolve the user's active workspace. Client passes it in a custom
    // header so we don't round-trip to the DB on every call.
    const workspaceId = request.headers.get('x-gem-workspace') || null;
    return { userId, workspaceId, anonymous: false };
  } catch (err) {
    console.error('[auth] verify failed:', err?.message || err);
    return { userId: null, workspaceId: null, anonymous: true };
  }
}
