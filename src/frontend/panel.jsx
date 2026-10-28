import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Box, Button, Heading, Icon, Inline, Link, LoadingButton, Lozenge, SectionMessage, Spinner, Stack, Text, xcss } from '@forge/react';
import { invoke, router } from '@forge/bridge';

const row = xcss({ paddingBlock: 'space.075' });
const card = xcss({ borderColor: 'color.border', borderWidth: 'border.width', borderStyle: 'solid', borderRadius: 'border.radius', padding: 'space.150' });

const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function Mark({ ok, pending }) {
  if (pending) return <Icon glyph="question-circle" label="Not checked" color="color.icon.subtle" size="small" />;
  return ok
    ? <Icon glyph="check-circle" label="Passed" color="color.icon.success" size="small" />
    : <Icon glyph="cross-circle" label="Failed" color="color.icon.danger" size="small" />;
}

function Criteria({ item, verdict, gate }) {
  const fresh = gate.checks.find((c) => c.id === 'fresh')?.ok;
  const byId = new Map((verdict?.criteria ?? []).map((v) => [v.id, v]));
  return (
    <Stack space="space.050">
      <Heading size="xsmall">Acceptance criteria</Heading>
      {item.criteria.map((c) => {
        const v = fresh ? byId.get(c.id) : null;
        return (
          <Box key={c.id} xcss={row}>
            <Inline space="space.100" alignBlock="start">
              <Mark ok={v?.passed} pending={!v} />
              <Stack space="space.025">
                <Text>{c.text}</Text>
                {v && <Text size="small" color="color.text.subtle">{v.reason}</Text>}
              </Stack>
            </Inline>
          </Box>
        );
      })}
    </Stack>
  );
}

function Evidence({ evidence }) {
  const prs = evidence.pullRequests;
  return (
    <Stack space="space.050">
      <Heading size="xsmall">Evidence found</Heading>
      {prs.map((p) => (
        <Inline key={p.url} space="space.100" alignBlock="center">
          <Link href={p.url} openNewTab>{`PR #${p.url.split('/').pop()}`}</Link>
          <Lozenge appearance={p.state === 'merged' ? 'success' : p.state === 'unknown' ? 'removed' : 'inprogress'}>{p.state}</Lozenge>
          {p.state === 'unknown'
            ? <Text size="small" color="color.text.danger">{p.error}</Text>
            : <Lozenge appearance={p.ci === 'passed' ? 'success' : p.ci === 'failed' ? 'removed' : 'default'}>{`CI ${p.ci}`}</Lozenge>}
          {p.approvals > 0 && <Text size="small">{`${p.approvals} approval${p.approvals > 1 ? 's' : ''}`}</Text>}
        </Inline>
      ))}
      <Text size="small" color="color.text.subtle">
        {[
          `${evidence.comments.length} comment${evidence.comments.length === 1 ? '' : 's'}`,
          `${evidence.links.length} link${evidence.links.length === 1 ? '' : 's'}`,
          evidence.subtasks.length ? `${evidence.subtasks.filter((s) => s.done).length}/${evidence.subtasks.length} subtasks done` : null,
          evidence.attachments.length ? `${evidence.attachments.length} attachment${evidence.attachments.length === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(' · ')}
      </Text>
    </Stack>
  );
}

function Gate({ gate }) {
  return (
    <Box xcss={card}>
      <Stack space="space.050">
        <Heading size="xsmall">Done gate</Heading>
        {gate.checks.map((c) => (
          <Inline key={c.id} space="space.100" alignBlock="center" spread="space-between">
            <Inline space="space.100" alignBlock="center">
              <Mark ok={c.ok} />
              <Text>{c.label}</Text>
            </Inline>
            <Text size="small" color="color.text.subtle">{c.detail}</Text>
          </Inline>
        ))}
      </Stack>
    </Box>
  );
}

function History({ history }) {
  if (history.length < 2) return null;
  return (
    <Stack space="space.050">
      <Heading size="xsmall">Verification history</Heading>
      {history.map((h) => (
        <Inline key={h.at} space="space.100" alignBlock="center">
          <Lozenge appearance={h.proven === h.total ? 'success' : 'removed'}>{`${h.proven}/${h.total} proven`}</Lozenge>
          <Text size="small" color="color.text.subtle">{`${when(h.at)} · ${Math.round(h.confidence * 100)}% confidence`}</Text>
        </Inline>
      ))}
    </Stack>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);
  const running = data?.job?.status === 'running';

  useEffect(() => {
    invoke('getState').then(setData).catch((e) => setFailure(e.message));
  }, []);

  // The verdict is produced by a queue worker; poll until it reports back.
  useEffect(() => {
    if (!running) return undefined;
    const timer = setTimeout(() => invoke('getState').then(setData).catch((e) => setFailure(e.message)), 3000);
    return () => clearTimeout(timer);
  }, [data]);

  const verify = () => invoke('verify').then(setData).catch((e) => setFailure(e.message));

  if (failure) return <SectionMessage appearance="error" title="Doneproof couldn't load">{failure}</SectionMessage>;
  if (!data) return <Spinner label="Collecting evidence" />;
  const { item, evidence, verdict, gate, job } = data;
  const fresh = gate.checks.find((c) => c.id === 'fresh')?.ok;

  return (
    <Stack space="space.200">
      <Inline spread="space-between" alignBlock="center">
        {gate.ready
          ? <Lozenge appearance="success" isBold>Ready for Done</Lozenge>
          : <Lozenge appearance={verdict ? 'removed' : 'default'} isBold>{verdict ? 'Not done yet' : 'Not verified'}</Lozenge>}
        <LoadingButton appearance="primary" isLoading={running} isDisabled={!item.criteria.length || !data.aiReady} onClick={verify}>
          {verdict ? 'Verify again' : 'Verify with AI'}
        </LoadingButton>
      </Inline>
      {running && <SectionMessage appearance="information">Reading the evidence against each criterion. This usually takes under a minute.</SectionMessage>}
      {job?.status === 'failed' && <SectionMessage appearance="warning" title="Verification failed">{job.error}</SectionMessage>}
      {!data.aiReady && (
        <SectionMessage appearance="information" title="Connect an AI provider">
          <Text>An admin needs to add an API key in Doneproof settings before work items can be verified.</Text>
          <Button appearance="link" onClick={() => router.navigate({ target: 'module', moduleKey: 'doneproof-settings' })}>Open app settings</Button>
        </SectionMessage>
      )}
      {item.criteria.length
        ? <Criteria item={item} verdict={verdict} gate={gate} />
        : <SectionMessage appearance="warning" title="No acceptance criteria">Add a heading “Acceptance criteria” with a bullet list to the description. Doneproof checks each bullet.</SectionMessage>}
      {verdict?.summary && fresh && <Text color="color.text.subtle">{verdict.summary}</Text>}
      <Evidence evidence={evidence} />
      <Gate gate={gate} />
      <History history={data.history} />
      {verdict && <Text size="small" color="color.text.subtlest">{`Last verified ${when(verdict.verifiedAt)} by ${verdict.model}`}</Text>}
    </Stack>
  );
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
