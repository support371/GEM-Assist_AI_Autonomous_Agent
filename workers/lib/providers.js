/**
 * Provider adapters · normalize every free LLM to Anthropic's /v1/messages shape.
 */

export async function callProvider({ provider, model, system, messages, max_tokens = 1024, temperature = 0.3 }, env) {
  if (provider === 'cf_workers_ai') return callWorkersAI({ model, system, messages, max_tokens, temperature }, env);
  if (provider === 'gemini')        return callGemini({ model, system, messages, max_tokens, temperature }, env);
  if (provider === 'groq')          return callGroq({ model, system, messages, max_tokens, temperature }, env);
  throw new Error(`Unknown provider: ${provider}`);
}

async function callWorkersAI({ model, system, messages, max_tokens, temperature }, env) {
  const payload = {
    messages: [
      ...(system ? [{ role:'system', content: system }] : []),
      ...messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
    ],
    max_tokens, temperature,
  };
  const res = await env.AI.run(model, payload);
  const text = res.response || res.output || '';
  return normalize(text, `cf_workers_ai/${model}`, res.usage);
}

async function callGemini({ model, system, messages, max_tokens, temperature }, env) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
  }));
  const payload = {
    contents,
    generationConfig: { maxOutputTokens: max_tokens, temperature },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
  };
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || `Gemini ${res.status}`);
  const text = d.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  return normalize(text, `gemini/${model}`, {
    input_tokens: d.usageMetadata?.promptTokenCount,
    output_tokens: d.usageMetadata?.candidatesTokenCount,
  });
}

async function callGroq({ model, system, messages, max_tokens, temperature }, env) {
  const payload = {
    model, max_tokens, temperature,
    messages: [
      ...(system ? [{ role:'system', content: system }] : []),
      ...messages,
    ],
  };
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || `Groq ${res.status}`);
  const text = d.choices?.[0]?.message?.content || '';
  return normalize(text, `groq/${model}`, {
    input_tokens: d.usage?.prompt_tokens,
    output_tokens: d.usage?.completion_tokens,
  });
}

function normalize(text, model, usage = {}) {
  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: String(text || '') }],
    model,
    stop_reason: 'end_turn',
    usage: {
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
    },
  };
}
