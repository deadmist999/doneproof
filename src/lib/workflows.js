// One-click setup: puts the Doneproof gate on every transition into a Done-category status of a
// workflow, or takes it off again, through Jira's workflow REST API.

const RULE = 'forge:expression-validator';
const GATE_SUFFIX = '/static/doneproof-gate';

const isGate = (v) => v.ruleKey === RULE && String(v.parameters?.key ?? '').endsWith(GATE_SUFFIX);

async function search(jira) {
  const workflows = [];
  const statuses = new Map();
  for (let startAt = 0; ; startAt += 50) {
    const page = await jira(`/rest/api/3/workflows/search?expand=values.transitions&maxResults=50&startAt=${startAt}`);
    workflows.push(...page.values);
    for (const s of page.statuses ?? []) statuses.set(s.statusReference ?? s.id, s);
    if (page.isLast || !page.values.length) break;
  }
  return { workflows, statuses };
}

function doneTransitions(workflow, statuses) {
  return (workflow.transitions ?? []).filter((t) => t.type !== 'INITIAL' && statuses.get(t.toStatusReference)?.statusCategory === 'DONE');
}

export async function listWorkflows(jira) {
  const { workflows, statuses } = await search(jira);
  return workflows
    .map((w) => {
      const done = doneTransitions(w, statuses);
      return {
        id: w.id,
        name: w.name,
        editable: w.isEditable !== false,
        doneTransitions: done.map((t) => t.name),
        gated: done.length > 0 && done.every((t) => (t.validators ?? []).some(isGate)),
      };
    })
    .filter((w) => w.doneTransitions.length)
    .sort((a, b) => Number(b.editable) - Number(a.editable) || a.name.localeCompare(b.name));
}

export async function setGate(jira, workflowId, on) {
  const { workflows, statuses } = await search(jira);
  const workflow = workflows.find((w) => w.id === workflowId);
  if (!workflow) throw new Error('Workflow not found.');
  if (workflow.isEditable === false) throw new Error(`${workflow.name} is a system workflow and can't be edited. Copy it first.`);

  let ruleId = null;
  if (on) {
    const capabilities = await jira(`/rest/api/3/workflows/capabilities?workflowId=${workflowId}`);
    ruleId = (capabilities.forgeRules ?? []).find((r) => r.id.endsWith(GATE_SUFFIX))?.id;
    if (!ruleId) throw new Error('Jira does not offer the Doneproof gate for this workflow yet. Reinstall or upgrade the app and try again.');
  }

  const done = new Set(doneTransitions(workflow, statuses).map((t) => t.id));
  const transitions = workflow.transitions.map((t) => {
    if (!done.has(t.id)) return t;
    const others = (t.validators ?? []).filter((v) => !isGate(v));
    return { ...t, validators: on ? [...others, { ruleKey: RULE, parameters: { key: ruleId } }] : others };
  });
  const used = new Set(workflow.statuses.map((s) => s.statusReference));
  const body = {
    statuses: [...statuses.values()].filter((s) => used.has(s.statusReference ?? s.id)).map(({ id, name, statusCategory, description, statusReference }) => ({ id, name, statusCategory, description, statusReference: statusReference ?? id })),
    workflows: [{ id: workflow.id, version: workflow.version, statuses: workflow.statuses, transitions, ...(workflow.startPointLayout && { startPointLayout: workflow.startPointLayout }) }],
  };
  await jira('/rest/api/3/workflows/update', { method: 'POST', body });
  return { gated: on, transitions: done.size };
}
