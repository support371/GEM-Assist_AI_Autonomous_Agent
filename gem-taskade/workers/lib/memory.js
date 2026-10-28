/**
 * Memory layer · mirrors Base44 Superagent's 3-tier model.
 *
 *   short_term    · last N conversation turns (per agent + user)      → agent_conversations table
 *   long_term     · persistent facts the agent extracts about the user → agent_facts table
 *   daily_summary · compressed session summary rolled up by cron        → agent_summaries table
 *
 * Backed by Supabase REST (free tier). Falls back to in-memory if Supabase not configured.
 */

const inMem = new Map(); // fallback: `${agent}:${user}:${kind}` → data

export class Memory {
  constructor(env, agentName, userId = 'anonymous') {
    this.env = env;
    this.agent = agentName;
    this.user = userId;
    this.hasSB = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY);
  }

  // ─── Short-term: last N turns ───
  async getShortTerm(limit = 12) {
    if (!this.hasSB) {
      const key = `${this.agent}:${this.user}:conv`;
      return (inMem.get(key) || []).slice(-limit);
    }
    // Append-only read: last N turns from the authoritative log.
    const rows = await this._sb(
      `agent_conversation_turns?agent_id=eq.${this.agent}&owner_id=eq.${this.user}&select=role,content,created_at&order=created_at.desc&limit=${limit}`,
    );
    return (rows || []).reverse().map(r => ({ role: r.role, content: r.content, ts: Date.parse(r.created_at) }));
  }

  async appendShortTerm(role, content, { toolName = null, modelUsed = null, latencyMs = null } = {}) {
    const turn = { role, content, ts: Date.now() };
    if (!this.hasSB) {
      const key = `${this.agent}:${this.user}:conv`;
      const prev = inMem.get(key) || [];
      inMem.set(key, [...prev, turn].slice(-50));
      return;
    }
    // Atomic single-row INSERT — no read-modify-write race.
    await this._sb('agent_conversation_turns', 'POST', {
      agent_id: this.agent, owner_id: this.user,
      role, content: String(content).slice(0, 32000),
      tool_name: toolName, model_used: modelUsed, latency_ms: latencyMs,
    });
  }

  // ─── Long-term: durable facts ───
  async getFacts(limit = 20) {
    if (!this.hasSB) {
      const key = `${this.agent}:${this.user}:facts`;
      return (inMem.get(key) || []).slice(-limit);
    }
    const data = await this._sb(`agent_facts?agent_id=eq.${this.agent}&owner_id=eq.${this.user}&select=fact,category,created_at&order=created_at.desc&limit=${limit}`);
    return (data || []).map(r => r.fact);
  }

  async addFact(fact, category = 'general') {
    if (!this.hasSB) {
      const key = `${this.agent}:${this.user}:facts`;
      inMem.set(key, [...(inMem.get(key) || []), fact].slice(-100));
      return;
    }
    await this._sb('agent_facts', 'POST', {
      agent_id: this.agent, owner_id: this.user,
      fact, category,
    });
  }

  // ─── Daily summary (set by cron) ───
  async getLatestSummary() {
    if (!this.hasSB) return null;
    const data = await this._sb(`agent_summaries?agent_id=eq.${this.agent}&owner_id=eq.${this.user}&order=created_at.desc&limit=1`);
    return data?.[0]?.summary || null;
  }

  // ─── Build the full context block for the system prompt ───
  async buildContextBlock() {
    const [facts, summary] = await Promise.all([this.getFacts(10), this.getLatestSummary()]);
    const parts = [];
    if (facts.length) {
      parts.push('## Known facts about the user');
      for (const f of facts) parts.push(`- ${f}`);
    }
    if (summary) {
      parts.push('\n## Recent session summary');
      parts.push(summary);
    }
    return parts.length ? parts.join('\n') : '';
  }

  // ─── Supabase REST helper ───
  async _sb(path, method = 'GET', body) {
    try {
      const res = await fetch(`${this.env.SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: this.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${this.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error(`[memory] supabase ${method} ${path} failed: ${res.status} ${errBody.slice(0, 200)}`);
        return null;
      }
      const t = await res.text();
      return t ? JSON.parse(t) : null;
    } catch (err) {
      console.error(`[memory] supabase ${method} ${path} threw:`, err?.message || err);
      return null;
    }
  }
}

/**
 * Extract durable facts from a user turn + assistant reply using a cheap LLM.
 * Called after each exchange when memory_scope is per_user_long_term.
 */
export async function extractFacts(providerCall, { userText, assistantText, env }) {
  const prompt = `Extract any durable facts about the user from this exchange, in a terse bullet list (max 3 bullets). Only facts that will matter in future conversations (preferences, decisions, project context, goals). Skip transient content, questions, and things the assistant said.

If no durable facts, respond with exactly: NONE

User: ${userText}
Assistant: ${assistantText}

Facts (bullets only, no preamble):`;
  const res = await providerCall({
    provider: 'cf_workers_ai',
    model: '@cf/meta/llama-3.1-8b-instruct',
    system: 'You are a fact extractor. Output only the requested bullets or NONE.',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 256, temperature: 0.1,
  }, env);
  const text = res.content?.[0]?.text || '';
  if (text.includes('NONE')) return [];
  return text.split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(l => l.length > 3 && l.length < 300);
}
