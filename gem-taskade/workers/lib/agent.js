/**
 * Agent runtime · orchestrates one turn end-to-end.
 *
 * Flow:
 *   1. Load agent definition
 *   2. Build system prompt: base instructions + memory context + tools block
 *   3. Classify task + route to best free model
 *   4. (plan_and_execute) Plan step: draft an approach
 *   5. Execute: generate response, loop if tool calls detected (max 3 iterations)
 *   6. (self_critique) Critique step: short reflection + revise if needed
 *   7. Persist short-term memory + extract durable facts in background
 *   8. Grade the response (structure, substance, relevance, latency)
 */

import { classifyTask, routeModel } from './router.js';
import { callProvider } from './providers.js';
import { Memory, extractFacts } from './memory.js';
import { toolsPrompt, parseToolCall, runSkill } from './skills.js';

export const AGENT_REGISTRY = {}; // populated at Worker init from agents/*.jsonc

export function registerAgents(defs) {
  for (const d of defs) AGENT_REGISTRY[d.name.toLowerCase()] = d;
}

export async function runAgent({ agentName, userText, userId, env, ctx }) {
  const def = AGENT_REGISTRY[String(agentName || '').toLowerCase()];
  if (!def) throw new Error(`Agent not found: ${agentName}`);

  const t0 = Date.now();
  const mem = new Memory(env, def.name, userId);

  // 1. Pull short-term history
  const history = await mem.getShortTerm(12);

  // 2. Build system prompt with memory + tools
  const memBlock = def.memory_scope !== 'none' ? await mem.buildContextBlock() : '';
  const toolsBlock = toolsPrompt(def.skills);
  const system = [
    def.instructions,
    memBlock,
    toolsBlock,
    reasoningBlock(def.reasoning_mode),
  ].filter(Boolean).join('\n\n');

  // 3. Classify + route
  const category = classifyTask(userText);
  const chain = routeModel(category, def.model_preferences, env);
  if (!chain.length) throw new Error('No free AI provider available. Enable Workers AI, GEMINI_API_KEY, or GROQ_API_KEY.');

  // 4. Plan step (if plan_and_execute)
  let planHint = '';
  if (def.reasoning_mode === 'plan_and_execute') {
    const planRes = await tryChain(chain, {
      system: def.instructions + '\n\nYou are planning a response. Output a brief numbered plan (3-5 steps) only, no final answer yet.',
      messages: [{ role: 'user', content: userText }],
      max_tokens: 384, temperature: 0.3,
    }, env);
    planHint = `\n\n## Planning hint for you to follow (then produce the final answer, NOT the plan itself):\n${planRes.content?.[0]?.text || ''}`;
  }

  // 5. Execute with tool loop
  const baseMessages = [...history.map(h => ({ role: h.role, content: h.content })), { role: 'user', content: userText + planHint }];
  let response = null;
  let iterations = 0;
  let messages = baseMessages;
  const maxTools = 3;

  while (iterations < maxTools + 1) {
    response = await tryChain(chain, {
      system, messages,
      max_tokens: def.max_tokens || 1024,
      temperature: def.temperature ?? 0.3,
    }, env);
    const text = response.content?.[0]?.text || '';
    const toolCall = parseToolCall(text);
    if (!toolCall || iterations >= maxTools) break;

    // Run the tool and feed the result back
    const result = await runSkill(toolCall, env);
    messages = [
      ...messages,
      { role: 'assistant', content: text },
      { role: 'user', content: `Tool result for ${toolCall.tool}: ${JSON.stringify(result).slice(0, 4000)}\n\nNow produce your final answer. Do not call another tool unless strictly necessary.` },
    ];
    iterations++;
  }

  let finalText = response.content?.[0]?.text || '';
  // Strip any lingering tool directives from the final answer
  finalText = finalText.replace(/<<TOOL_CALL>>[\s\S]*?<<END_TOOL_CALL>>/g, '').trim();

  // 6. Self-critique (short, cheap, boosts quality)
  if (def.fallback_behavior === 'self_critique') {
    try {
      const critique = await tryChain(chain, {
        system: 'You are reviewing an assistant answer for quality. If the answer is already strong, respond with the single word GOOD. Otherwise, output a revised version of the answer, nothing else.',
        messages: [
          { role: 'user', content: `Question: ${userText}\n\nAnswer:\n${finalText}\n\nReview this answer. Is it correct, concrete, and well-structured for the user?` },
        ],
        max_tokens: Math.min(def.max_tokens || 1024, 1536),
        temperature: 0.2,
      }, env);
      const critText = (critique.content?.[0]?.text || '').trim();
      if (critText && !/^GOOD\.?$/i.test(critText) && critText.length > 50) {
        finalText = critText;
      }
    } catch {}
  }

  // 7. Grade (needed by persist task below)
  const grade = gradeResponse(finalText, Date.now() - t0);

  // 8. Persist memory + grade (background)
  const persistTask = (async () => {
    // Grade row — always written, independent of memory_scope
    try {
      await mem._sb('agent_grades', 'POST', {
        agent_id: def.name,
        owner_id: userId,
        score: grade.score,
        model_used: response.model,
        latency_ms: grade.latency_ms,
        input_tokens: response.usage?.input_tokens ?? null,
        output_tokens: response.usage?.output_tokens ?? null,
      });
    } catch (err) {
      console.error('[agent] grade persist failed:', err?.message || err);
    }
    if (def.memory_scope === 'none') return;
    await mem.appendShortTerm('user', userText);
    await mem.appendShortTerm('assistant', finalText);
    if (def.memory_scope === 'per_user_long_term') {
      const facts = await extractFacts(callProvider, { userText, assistantText: finalText, env });
      for (const f of facts) await mem.addFact(f);
    }
  })();
  if (ctx?.waitUntil) ctx.waitUntil(persistTask);
  else await persistTask;

  return {
    content: [{ type: 'text', text: finalText }],
    model: response.model,
    agent: def.name,
    classification: category,
    iterations,
    grade,
    usage: response.usage,
    latency_ms: Date.now() - t0,
  };
}

/** Try each provider in the chain until one succeeds. Opens circuit on repeated failure. */
async function tryChain(chain, args, env) {
  let lastErr = null;
  for (const { provider, model } of chain) {
    try {
      return await callProvider({ ...args, provider, model }, env);
    } catch (e) {
      lastErr = e;
      console.warn(`[agent] ${provider}/${model} failed: ${e.message}`);
    }
  }
  throw new Error(`All providers failed. Last: ${lastErr?.message}`);
}

function reasoningBlock(mode) {
  if (mode === 'plan_and_execute') return '## Reasoning\nThink step by step. State assumptions. Prefer concrete to vague.';
  if (mode === 'threat_model')     return '## Reasoning\nUse STRIDE/PASTA when relevant. For each risk: severity, prerequisites, mitigation, detection.';
  if (mode === 'quantitative')     return '## Reasoning\nShow the math. Cite sources with dates. Prefer tables for comparisons. Flag unknowns.';
  if (mode === 'retry_strict')     return '## Output\nReturn ONLY the requested JSON. No prose, no code fences.';
  if (mode === 'direct')           return '';
  return '## Reasoning\nThink step by step.';
}

/** Lightweight response grading (0-100). Mirrors the scoring in the SPA. */
function gradeResponse(text, latencyMs) {
  let score = 50;
  const wc = (text || '').split(/\s+/).length;
  if (wc > 20)  score += 15;
  if (wc > 100) score += 5;
  if (/[\n\-•\d\.]/.test(text || '')) score += 10;
  if (latencyMs < 3000) score += 5;
  if (!/i can't|i cannot|as an ai/i.test(text || '')) score += 15;
  return Math.min(100, score);
}
