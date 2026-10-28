// The gate. Deterministic rules over the stored verdict and freshly collected evidence; the AI
// never decides on its own whether work is done.

import { changesSince } from './evidence.js';

export const DEFAULT_RULES = {
  threshold: 0.8,
  requireMergedPrs: true,
  requireGreenCi: true,
  requireSubtasksDone: true,
  requireBlockersDone: true,
};

export function evaluate({ item, evidence, basis, fingerprint }, verdict, rules = DEFAULT_RULES) {
  const prs = evidence.pullRequests;
  const checks = [
    {
      id: 'criteria',
      label: 'Acceptance criteria are written down',
      ok: item.criteria.length > 0,
      detail: item.criteria.length ? `${item.criteria.length} criteria` : 'Add an "Acceptance criteria" list to the description',
    },
    {
      id: 'verified',
      label: 'Every criterion is proven by the evidence',
      ok: Boolean(verdict) && verdict.criteria.length === item.criteria.length && verdict.criteria.every((c) => c.passed),
      detail: !verdict ? 'Not verified yet' : `${verdict.criteria.filter((c) => c.passed).length} of ${verdict.criteria.length} proven`,
    },
    {
      id: 'confidence',
      label: `Verifier confidence is at least ${Math.round(rules.threshold * 100)}%`,
      ok: Boolean(verdict) && verdict.confidence >= rules.threshold,
      detail: verdict ? `${Math.round(verdict.confidence * 100)}%` : '—',
    },
    {
      id: 'fresh',
      label: 'Nothing changed since the verification',
      ok: Boolean(verdict) && verdict.fingerprint === fingerprint,
      detail: !verdict ? '—' : verdict.fingerprint === fingerprint ? 'Up to date' : staleDetail(verdict.basis, basis),
    },
  ];
  if (rules.requireMergedPrs && prs.length) {
    const open = prs.filter((p) => p.state !== 'merged');
    checks.push({ id: 'merged', label: 'Linked pull requests are merged', ok: !open.length, detail: open.length ? `Not merged: ${open.map(prName).join(', ')}` : `${prs.length} merged` });
  }
  if (rules.requireGreenCi && prs.length) {
    const red = prs.filter((p) => !['passed', 'none'].includes(p.ci));
    checks.push({ id: 'ci', label: 'CI passed on linked pull requests', ok: !red.length, detail: red.length ? red.map((p) => `${prName(p)}: ${p.ci}`).join(', ') : 'Green' });
  }
  if (rules.requireSubtasksDone && evidence.subtasks.length) {
    const left = evidence.subtasks.filter((s) => !s.done);
    checks.push({ id: 'subtasks', label: 'All subtasks are done', ok: !left.length, detail: left.length ? `Open: ${left.map((s) => s.key).join(', ')}` : `${evidence.subtasks.length} done` });
  }
  if (rules.requireBlockersDone && evidence.blockedBy.length) {
    const left = evidence.blockedBy.filter((b) => !b.done);
    checks.push({ id: 'blockers', label: 'Nothing is blocking it', ok: !left.length, detail: left.length ? `Blocked by ${left.map((b) => b.key).join(', ')}` : 'Blockers resolved' });
  }
  return { ready: checks.every((c) => c.ok), checks };
}

function staleDetail(before, now) {
  const changes = now ? changesSince(before, now) : [];
  return changes.length ? `Changed since: ${changes.join(', ')}` : 'Criteria or evidence changed; verify again';
}

const prName = (p) => `#${p.url.split('/').pop()}`;

export function blockMessage(result) {
  const failed = result.checks.filter((c) => !c.ok);
  return `Doneproof: not done yet. ${failed.map((c) => `${c.label} (${c.detail})`).join('; ')}. Open the Doneproof panel on this work item to see why.`;
}
