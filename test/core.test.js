import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceCriteria } from '../src/lib/adf.js';
import { assess, normalize } from '../src/lib/verifier.js';
import { evaluate, DEFAULT_RULES } from '../src/lib/policy.js';
import { changesSince, ciStatus } from '../src/lib/evidence.js';

const text = (t) => ({ type: 'text', text: t });
const para = (t) => ({ type: 'paragraph', content: [text(t)] });
const bullets = (...items) => ({ type: 'bulletList', content: items.map((t) => ({ type: 'listItem', content: [para(t)] })) });
const heading = (t) => ({ type: 'heading', attrs: { level: 3 }, content: [text(t)] });

test('criteria come from the list under the Acceptance criteria heading', () => {
  const doc = { type: 'doc', content: [para('Checkout fails for EU cards.'), heading('Acceptance criteria'), bullets('EU cards succeed', 'Test covers 3DS'), heading('Notes'), bullets('not a criterion')] };
  assert.deepEqual(acceptanceCriteria(doc), [{ id: 'AC1', text: 'EU cards succeed' }, { id: 'AC2', text: 'Test covers 3DS' }]);
});

test('a bold "Definition of done:" paragraph works as a heading too', () => {
  const doc = { type: 'doc', content: [para('Definition of done:'), bullets('Deployed to prod')] };
  assert.deepEqual(acceptanceCriteria(doc).map((c) => c.text), ['Deployed to prod']);
});

test('no heading and no task list means no criteria', () => {
  assert.deepEqual(acceptanceCriteria({ type: 'doc', content: [para('just text'), bullets('a')] }), []);
});

test('normalize maps drifting model output and fails what it cannot map', () => {
  const criteria = [{ id: 'AC1', text: 'a' }, { id: 'AC2', text: 'b' }];
  const out = normalize(criteria, { criteria: [{ id: 'ac1', passed: 'true', reason: 'PR merged' }], confidence: 85 });
  assert.equal(out.criteria[0].passed, true);
  assert.equal(out.criteria[1].passed, false);
  assert.equal(out.confidence, 0.85);
  assert.equal(normalize(criteria, {}).criteria.every((c) => !c.passed), true);
});

const state = (over = {}) => ({
  item: { criteria: [{ id: 'AC1', text: 'a' }] },
  evidence: { pullRequests: [], subtasks: [], blockedBy: [], ...over },
  fingerprint: 'f1',
});
const verdict = { criteria: [{ id: 'AC1', passed: true }], confidence: 0.9, fingerprint: 'f1' };

test('gate passes only with a fresh, confident, all-passed verdict', () => {
  assert.equal(evaluate(state(), verdict).ready, true);
  assert.equal(evaluate(state(), null).ready, false);
  assert.equal(evaluate(state(), { ...verdict, confidence: 0.5 }).ready, false);
  assert.equal(evaluate({ ...state(), fingerprint: 'f2' }, verdict).ready, false);
  assert.equal(evaluate(state(), { ...verdict, criteria: [{ id: 'AC1', passed: false }] }).ready, false);
});

test('gate enforces merged PRs, green CI, done subtasks and blockers', () => {
  assert.equal(evaluate(state({ pullRequests: [{ url: 'x/pull/1', state: 'open', ci: 'passed' }] }), verdict).ready, false);
  assert.equal(evaluate(state({ pullRequests: [{ url: 'x/pull/1', state: 'merged', ci: 'failed' }] }), verdict).ready, false);
  assert.equal(evaluate(state({ pullRequests: [{ url: 'x/pull/1', state: 'merged', ci: 'passed' }] }), verdict).ready, true);
  assert.equal(evaluate(state({ subtasks: [{ key: 'S-2', done: false }] }), verdict).ready, false);
  assert.equal(evaluate(state({ blockedBy: [{ key: 'S-3', done: false }] }), verdict).ready, false);
  assert.equal(evaluate(state({ subtasks: [{ key: 'S-2', done: false }] }), verdict, { ...DEFAULT_RULES, requireSubtasksDone: false }).ready, true);
});

test('CI status summarises check runs', () => {
  assert.equal(ciStatus([]), 'none');
  assert.equal(ciStatus([{ status: 'in_progress' }]), 'running');
  assert.equal(ciStatus([{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'failure' }]), 'failed');
  assert.equal(ciStatus([{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'skipped' }]), 'passed');
});

test('changesSince names what moved since the verdict', () => {
  const before = { criteria: ['a'], comments: [['1', 't1']], links: ['x'], subtasks: [['S-2', 'To Do']], blockedBy: [], pullRequests: [['https://github.com/o/r/pull/1', 'sha1', 'open', 'failed', 0]] };
  const now = { criteria: ['a'], comments: [['1', 't1'], ['2', 't2']], links: ['x'], subtasks: [['S-2', 'Done']], blockedBy: [], pullRequests: [['https://github.com/o/r/pull/1', 'sha2', 'merged', 'passed', 0]] };
  assert.deepEqual(changesSince(before, now), ['1 new comment', 'PR #1: open → merged', 'PR #1 CI: failed → passed', 'S-2 is now Done']);
  assert.deepEqual(changesSince(before, before), []);
});

test('an unreadable pull request blocks the gate', () => {
  const r = evaluate(state({ pullRequests: [{ url: 'x/pull/1', state: 'unknown', ci: 'unknown' }] }), verdict);
  assert.equal(r.ready, false);
  assert.equal(r.checks.find((c) => c.id === 'github').ok, false);
});

test('assess retries an overloaded provider and falls back to the backup model', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const model = JSON.parse(init.body).model;
    calls.push(model);
    if (calls.length < 4) return { ok: false, status: 503, json: async () => ({ error: { message: 'overloaded' } }) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"criteria":[{"id":"AC1","passed":true,"reason":"r"}],"confidence":0.9}' } }] }) };
  };
  const item = { key: 'S-1', summary: 's', criteria: [{ id: 'AC1', text: 'a' }] };
  const out = await assess({ provider: 'gemini', apiKey: 'k' }, item, {}, fetchImpl, async () => {});
  assert.deepEqual(calls, ['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash']);
  assert.equal(out.model, 'gemini-3.5-flash');
  assert.equal(out.criteria[0].passed, true);
});

test('assess does not retry a rejected key', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return { ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } }) }; };
  await assert.rejects(assess({ provider: 'gemini', apiKey: 'k' }, { criteria: [] }, {}, fetchImpl, async () => {}), /401/);
  assert.equal(n, 1);
});
