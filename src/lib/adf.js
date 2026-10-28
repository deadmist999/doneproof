// Atlassian Document Format helpers: Jira returns descriptions and comments as ADF trees.

export function adfText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'inlineCard' || node.type === 'blockCard') return node.attrs?.url ?? '';
  if (node.type === 'mention') return node.attrs?.text ?? '';
  const inner = (node.content ?? []).map(adfText).join(node.type === 'doc' || node.type?.endsWith('List') ? '\n' : '');
  return ['paragraph', 'heading', 'listItem', 'taskItem'].includes(node.type) ? `${inner}\n` : inner;
}

export function adfLinks(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'inlineCard' || node.type === 'blockCard') out.add(node.attrs?.url);
  for (const mark of node.marks ?? []) if (mark.type === 'link') out.add(mark.attrs?.href);
  for (const child of node.content ?? []) adfLinks(child, out);
  out.delete(undefined);
  return out;
}

const HEADING = /^(acceptance criteria|definition of done|done when|dod)\b/i;

// Criteria are the list items under an "Acceptance criteria" (or "Definition of done") heading or
// bold paragraph. A description with no such heading falls back to its task list, if it has one.
export function acceptanceCriteria(doc) {
  const blocks = doc?.content ?? [];
  const items = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const label = adfText(block).trim().replace(/[:\s]+$/, '');
    if (!['heading', 'paragraph'].includes(block.type) || !HEADING.test(label)) continue;
    for (let j = i + 1; j < blocks.length && /List$/.test(blocks[j].type); j++) {
      for (const item of blocks[j].content ?? []) items.push(adfText(item).trim());
    }
  }
  if (!items.length) {
    for (const block of blocks.filter((b) => b.type === 'taskList')) {
      for (const item of block.content ?? []) items.push(adfText(item).trim());
    }
  }
  return items.filter(Boolean).map((text, k) => ({ id: `AC${k + 1}`, text: text.replace(/\s+/g, ' ') }));
}
