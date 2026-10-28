import api, { assumeTrustedRoute, fetch, route } from '@forge/api';
import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
import { Queue } from '@forge/events';
import { collect } from './lib/evidence.js';
import { assess, PROVIDERS } from './lib/verifier.js';
import { blockMessage, DEFAULT_RULES, evaluate } from './lib/policy.js';
import { listWorkflows, setGate } from './lib/workflows.js';

const PROPERTY = 'doneproof';
const queue = new Queue({ key: 'doneproof-verify' });
// A job that hasn't reported back in this long died with its worker.
const JOB_TTL_MS = 5 * 60 * 1000;
const HISTORY = 10;

// Paths are built in evidence.js from the issue key Forge hands us, never from user input.
const jiraAs = (actor) => async (path, { method = 'GET', body } = {}) => {
  const response = await actor.requestJira(assumeTrustedRoute(path), {
    method,
    headers: { Accept: 'application/json', ...(body && { 'Content-Type': 'application/json' }) },
    ...(body && { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(`Jira ${response.status} on ${path.split('?')[0]}${detail.errorMessages?.length ? `: ${detail.errorMessages.join(' ')}` : ''}`);
  }
  return response.status === 204 ? null : response.json();
};

const githubWith = (token) => async (path) => {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'doneproof-forge-app', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  return response.json();
};

async function settings() {
  const saved = (await kvs.get('settings')) ?? {};
  return { provider: saved.provider ?? 'gemini', model: saved.model ?? '', rules: { ...DEFAULT_RULES, ...saved.rules } };
}

// A site's own key wins. Without one, the app's bundled Gemini key (a Forge environment variable)
// lets a fresh install verify work items straight away.
async function aiConfig(config) {
  const siteKey = await kvs.getSecret('ai-key');
  if (siteKey) return { provider: config.provider, model: config.model, apiKey: siteKey, source: 'site' };
  if (process.env.DONEPROOF_AI_KEY) return { provider: 'gemini', model: '', apiKey: process.env.DONEPROOF_AI_KEY, source: 'bundled' };
  return null;
}

// The issue property is what JQL and other tools see, but Jira serves it eventually consistent;
// the app's own copy is read too and the newer of the two wins.
async function verdictOf(key, jira) {
  const [property, own] = await Promise.all([
    jira(`/rest/api/3/issue/${key}/properties/${PROPERTY}`).then((r) => r?.value ?? null, () => null),
    kvs.get(`verdict:${key}`),
  ]);
  if (!property || !own) return property ?? own ?? null;
  return Date.parse(own.verifiedAt) > Date.parse(property.verifiedAt) ? own : property;
}

async function gather(key, actor) {
  const jira = jiraAs(actor);
  const github = githubWith((await kvs.getSecret('github-token')) || process.env.DONEPROOF_GITHUB_TOKEN);
  const [state, verdict, config] = await Promise.all([collect(key, { jira, github }), verdictOf(key, jira), settings()]);
  return { state, verdict, config };
}

async function jobOf(key) {
  const job = await kvs.get(`job:${key}`);
  if (job?.status === 'running' && Date.now() - Date.parse(job.startedAt) > JOB_TTL_MS) return { status: 'failed', error: 'The verification timed out. Try again.' };
  return job ?? null;
}

async function view(key, { state, verdict, config }) {
  return {
    item: state.item,
    evidence: state.evidence,
    verdict,
    gate: evaluate(state, verdict, config.rules),
    job: await jobOf(key),
    history: (await kvs.get(`history:${key}`)) ?? [],
    aiReady: Boolean(await aiConfig(config)),
  };
}

const resolver = new Resolver();

resolver.define('getState', async ({ context }) => {
  const key = context.extension.issue.key;
  return view(key, await gather(key, api.asUser()));
});

resolver.define('verify', async ({ context }) => {
  const key = context.extension.issue.key;
  const data = await gather(key, api.asUser());
  if (!data.state.item.criteria.length) throw new Error('This work item has no acceptance criteria to verify.');
  await startVerification(key, context.accountId);
  return view(key, data);
});

async function startVerification(key, accountId) {
  if ((await jobOf(key))?.status === 'running') return;
  await kvs.set(`job:${key}`, { status: 'running', startedAt: new Date().toISOString() });
  try {
    await queue.push({ body: { key, accountId } });
  } catch (error) {
    await kvs.set(`job:${key}`, { status: 'failed', error: `Could not start the verification: ${error.message}` });
  }
}

async function isAdmin() {
  const response = await api.asUser().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`);
  return (await response.json()).permissions?.ADMINISTER?.havePermission === true;
}

resolver.define('getSettings', async () => {
  const config = await settings();
  return {
    ...config,
    providers: PROVIDERS,
    hasKey: Boolean(await kvs.getSecret('ai-key')),
    bundled: Boolean(process.env.DONEPROOF_AI_KEY),
    hasGithubToken: Boolean(await kvs.getSecret('github-token')),
  };
});

resolver.define('saveSettings', async ({ payload }) => {
  if (!(await isAdmin())) throw new Error('Only Jira admins can change Doneproof settings.');
  if (!PROVIDERS[payload.provider]) throw new Error('Unknown AI provider.');
  const threshold = Math.min(1, Math.max(0.5, Number(payload.rules?.threshold ?? DEFAULT_RULES.threshold)));
  await kvs.set('settings', {
    provider: payload.provider,
    model: String(payload.model ?? '').trim(),
    rules: { ...DEFAULT_RULES, ...payload.rules, threshold },
  });
  if (payload.apiKey) await kvs.setSecret('ai-key', payload.apiKey.trim());
  if (payload.clearApiKey) await kvs.deleteSecret('ai-key');
  if (payload.githubToken) await kvs.setSecret('github-token', payload.githubToken.trim());
  if (payload.clearGithubToken) await kvs.deleteSecret('github-token');
  return { ok: true };
});

resolver.define('getWorkflows', async () => {
  if (!(await isAdmin())) throw new Error('Only Jira admins can manage workflows.');
  return listWorkflows(jiraAs(api.asUser()));
});

resolver.define('setGate', async ({ payload }) => {
  if (!(await isAdmin())) throw new Error('Only Jira admins can manage workflows.');
  await setGate(jiraAs(api.asUser()), String(payload.workflowId), Boolean(payload.on));
  return listWorkflows(jiraAs(api.asUser()));
});

export const handler = resolver.getDefinitions();

// Queue consumer: the AI call can take longer than a UI resolver may run, so it happens here.
export async function workerHandler(event) {
  const { key, accountId } = event.body;
  try {
    const { state, config } = await gather(key, api.asApp());
    const unreadable = state.evidence.pullRequests.filter((p) => p.state === 'unknown');
    if (unreadable.length) throw new Error(`${unreadable[0].error} for ${unreadable.map((p) => `PR #${p.url.split('/').pop()}`).join(', ')}. Verifying without it would judge the work blind; try again in a minute, or add a GitHub token in Doneproof settings.`);
    const ai = await aiConfig(config);
    if (!ai) throw new Error('No AI provider is configured. An admin can add a key in Doneproof settings.');
    const result = await assess(ai, state.item, state.evidence, fetch);
    const allProven = result.criteria.every((c) => c.passed) ? 'yes' : 'no';
    const verdict = { ...result, allProven, fingerprint: state.fingerprint, basis: state.basis, verifiedAt: new Date().toISOString(), verifiedBy: accountId };
    const saved = await api.asApp().requestJira(route`/rest/api/3/issue/${key}/properties/${PROPERTY}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verdict),
    });
    if (!saved.ok) throw new Error(`Jira refused to store the verdict (${saved.status})`);
    await kvs.set(`verdict:${key}`, verdict);
    const entry = { at: verdict.verifiedAt, proven: verdict.criteria.filter((c) => c.passed).length, total: verdict.criteria.length, confidence: verdict.confidence, model: verdict.model };
    await kvs.set(`history:${key}`, [entry, ...((await kvs.get(`history:${key}`)) ?? [])].slice(0, HISTORY));
    await kvs.set(`job:${key}`, { status: 'done', finishedAt: verdict.verifiedAt });
  } catch (error) {
    await kvs.set(`job:${key}`, { status: 'failed', error: error.message });
  }
}

// Workflow validator: the transition goes through only when the gate passes on evidence collected
// right now. Any failure to evaluate blocks the transition rather than letting it through.
export async function validate(args) {
  try {
    const { state, verdict, config } = await gather(args.issue.key, api.asApp());
    const result = evaluate(state, verdict, config.rules);
    return result.ready ? { result: true } : { result: false, errorMessage: blockMessage(result) };
  } catch (error) {
    return { result: false, errorMessage: `Doneproof could not check this work item (${error.message}). Try again, or ask an admin.` };
  }
}

// Rovo actions, also exposed as MCP tools. The issue key comes from the model, so it is checked
// against the key format and read as the calling user, who must be able to see the work item.
const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

function issueKeyFrom(payload) {
  const key = String(payload.issueKey ?? payload.context?.jira?.issueKey ?? '').trim().toUpperCase();
  if (!ISSUE_KEY.test(key)) throw new Error('Give a Jira work item key such as SHOP-1.');
  return key;
}

export async function checkStatus(payload) {
  const key = issueKeyFrom(payload);
  const data = await gather(key, api.asUser());
  const { gate, verdict, evidence, job } = await view(key, data);
  const fresh = gate.checks.find((c) => c.id === 'fresh')?.ok;
  return {
    workItem: key,
    summary: data.state.item.summary,
    readyForDone: gate.ready,
    gate: gate.checks.map(({ label, ok, detail }) => ({ rule: label, passed: ok, detail })),
    criteria: data.state.item.criteria.map((c) => {
      const v = fresh ? verdict?.criteria.find((x) => x.id === c.id) : null;
      return { criterion: c.text, proven: v ? v.passed : null, reason: v?.reason ?? (verdict ? 'Verdict is out of date' : 'Not verified yet') };
    }),
    pullRequests: evidence.pullRequests.map(({ url, state, ci, approvals }) => ({ url, state, ci, approvals })),
    lastVerified: verdict?.verifiedAt ?? null,
    verificationRunning: job?.status === 'running',
  };
}

export async function requestVerification(payload) {
  const key = issueKeyFrom(payload);
  const { state } = await gather(key, api.asUser());
  if (!state.item.criteria.length) return { workItem: key, started: false, reason: 'The work item has no acceptance criteria to verify.' };
  await startVerification(key, payload.context?.accountId);
  return { workItem: key, started: true, note: 'Verification takes up to a minute. Check the status again to see the verdict.' };
}
