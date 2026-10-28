// AI verdict on whether the evidence proves each acceptance criterion. The model only assesses;
// whether the issue may move to Done is decided by policy.js.

export const PROVIDERS = {
  gemini: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.5-flash-lite', extra: { reasoning_effort: 'low' } },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  anthropic: { label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-5-5' },
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct' },
  mistral: { label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
};

const SYSTEM = [
  'You check whether a Jira work item is really done.',
  'You get its acceptance criteria and the evidence gathered from the work item: description, comments, links, subtasks and linked GitHub pull requests with their merge, review and CI status.',
  'For every criterion decide whether the evidence proves it. A claim without a concrete result (a link, a test run, a merged PR, a number) does not prove anything.',
  'Return JSON only: {"criteria":[{"id","passed","reason"}],"confidence":0..1,"summary"}.',
  'Use the exact criterion ids, cover each exactly once, keep each reason to one sentence that names the evidence.',
].join(' ');

export async function assess({ provider, model, apiKey }, item, evidence, fetchImpl = fetch) {
  const preset = PROVIDERS[provider];
  if (!preset || !apiKey) throw new Error('No AI provider is configured. An admin can set one in Apps → Doneproof settings.');
  const response = await fetchImpl(`${preset.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || preset.model,
      ...preset.extra,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify({ workItem: { key: item.key, summary: item.summary, criteria: item.criteria }, evidence }) },
      ],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`The AI provider refused the request (${response.status}): ${body.error?.message ?? 'no details'}`);
  const raw = body.choices?.[0]?.message?.content ?? '';
  return { ...normalize(item.criteria, parseJson(raw)), model: model || preset.model };
}

// Some models wrap JSON in a code fence even in JSON mode.
function parseJson(raw) {
  try {
    return JSON.parse(raw.replace(/^\s*```(?:json)?|```\s*$/g, ''));
  } catch {
    return {};
  }
}

// Models drift from the schema: ids get renamed, booleans arrive as strings, confidence as a
// percentage. A criterion the answer can't be mapped to fails instead of passing silently.
export function normalize(criteria, answer) {
  const results = Array.isArray(answer?.criteria) ? answer.criteria : [];
  const byId = new Map(results.map((r) => [String(r?.id ?? '').toUpperCase(), r]));
  const verdicts = criteria.map((c, k) => {
    const r = byId.get(c.id) ?? byId.get(String(k + 1)) ?? results[k];
    if (!r) return { id: c.id, passed: false, reason: 'The verifier did not assess this criterion.' };
    return { id: c.id, passed: r.passed === true || r.passed === 'true', reason: String(r.reason ?? '').trim() || 'No reason given.' };
  });
  let confidence = Number(answer?.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  if (confidence > 1) confidence /= 100;
  return {
    criteria: verdicts,
    confidence: Number(Math.min(1, Math.max(0, confidence)).toFixed(2)),
    summary: String(answer?.summary ?? '').trim(),
  };
}
