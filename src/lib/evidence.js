// Collects what the verifier is allowed to look at, from Jira and from GitHub pull requests the
// work item links to. Everything here is a fact Doneproof fetched itself, not something a person typed.
import { createHash } from 'node:crypto';
import { acceptanceCriteria, adfLinks, adfText } from './adf.js';

const PR_URL = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/;
const MAX_PRS = 3;
const MAX_COMMENTS = 20;
// Enough of the diff for the verifier to see what changed and which tests were added.
const MAX_PATCH_CHARS = 6000;

export async function collect(key, { jira, github }) {
  const issue = await jira(`/rest/api/3/issue/${key}?fields=summary,description,status,subtasks,issuelinks,attachment`);
  const [comments, remoteLinks] = await Promise.all([
    jira(`/rest/api/3/issue/${key}/comment?orderBy=-created&maxResults=${MAX_COMMENTS}`),
    jira(`/rest/api/3/issue/${key}/remotelink`),
  ]);
  const f = issue.fields;
  const criteria = acceptanceCriteria(f.description);

  const urls = new Set([...adfLinks(f.description), ...remoteLinks.map((l) => l.object?.url)]);
  for (const c of comments.comments ?? []) adfLinks(c.body, urls);
  const prUrls = [...new Set([...urls].map((u) => u?.match(PR_URL)?.[0]).filter(Boolean))].slice(0, MAX_PRS);
  const pullRequests = await Promise.all(prUrls.map((url) => pullRequest(url, github)));

  const evidence = {
    description: adfText(f.description).trim().slice(0, 4000),
    comments: (comments.comments ?? []).map((c) => ({ author: c.author?.displayName, created: c.created, text: adfText(c.body).trim().slice(0, 1500) })).reverse(),
    links: remoteLinks.map((l) => ({ title: l.object?.title, url: l.object?.url })),
    attachments: (f.attachment ?? []).map((a) => a.filename),
    subtasks: (f.subtasks ?? []).map((s) => ({ key: s.key, summary: s.fields?.summary, status: s.fields?.status?.name, done: s.fields?.status?.statusCategory?.key === 'done' })),
    blockedBy: (f.issuelinks ?? [])
      .filter((l) => l.type?.inward === 'is blocked by' && l.inwardIssue)
      .map((l) => ({ key: l.inwardIssue.key, status: l.inwardIssue.fields?.status?.name, done: l.inwardIssue.fields?.status?.statusCategory?.key === 'done' })),
    pullRequests,
  };
  return { item: { key, summary: f.summary, criteria }, evidence, fingerprint: fingerprint(criteria, comments.comments ?? [], evidence) };
}

async function pullRequest(url, github) {
  const [, owner, repo, number] = url.match(PR_URL);
  try {
    const pr = await github(`/repos/${owner}/${repo}/pulls/${number}`);
    const [checks, reviews, files] = await Promise.all([
      github(`/repos/${owner}/${repo}/commits/${pr.head.sha}/check-runs?per_page=50`),
      github(`/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=50`),
      github(`/repos/${owner}/${repo}/pulls/${number}/files?per_page=30`),
    ]);
    let budget = MAX_PATCH_CHARS;
    const changes = (files ?? []).map((f) => {
      const patch = (f.patch ?? '').slice(0, Math.max(0, budget));
      budget -= patch.length;
      return { file: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch };
    });
    const runs = (checks.check_runs ?? []).map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion }));
    const latestReview = new Map();
    for (const r of reviews ?? []) latestReview.set(r.user?.login, r.state);
    return {
      url,
      title: pr.title,
      body: (pr.body ?? '').slice(0, 1500),
      baseBranch: pr.base?.ref,
      state: pr.merged ? 'merged' : pr.state,
      headSha: pr.head.sha,
      mergedAt: pr.merged_at,
      approvals: [...latestReview.values()].filter((s) => s === 'APPROVED').length,
      changesRequested: [...latestReview.values()].includes('CHANGES_REQUESTED'),
      ci: ciStatus(runs),
      checks: runs.slice(0, 15),
      changes,
    };
  } catch (error) {
    return { url, state: 'unknown', error: `Could not read this pull request from GitHub: ${error.message}` };
  }
}

export function ciStatus(runs) {
  if (!runs.length) return 'none';
  if (runs.some((r) => r.status !== 'completed')) return 'running';
  if (runs.some((r) => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(r.conclusion))) return 'failed';
  return 'passed';
}

// Changes when the criteria or the evidence change, so a verdict can't be reused after someone
// edits the criteria, adds a comment or pushes to the pull request.
function fingerprint(criteria, comments, evidence) {
  const basis = {
    criteria: criteria.map((c) => c.text),
    comments: comments.map((c) => [c.id, c.updated]),
    links: evidence.links.map((l) => l.url).sort(),
    subtasks: evidence.subtasks.map((s) => [s.key, s.status]),
    blockedBy: evidence.blockedBy.map((b) => [b.key, b.status]),
    pullRequests: evidence.pullRequests.map((p) => [p.url, p.headSha, p.state, p.ci, p.approvals]),
  };
  return createHash('sha256').update(JSON.stringify(basis)).digest('hex').slice(0, 16);
}
