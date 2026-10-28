import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Box, Button, DynamicTable, Lozenge, LoadingButton, Form, FormFooter, FormSection, Heading, HelperMessage, Label, Range, SectionMessage, Select, Spinner, Stack, Text, Textfield, Toggle, Inline, useForm, xcss } from '@forge/react';
import { invoke, router } from '@forge/bridge';

const page = xcss({ maxWidth: '640px' });

const RULES = [
  ['requireMergedPrs', 'Linked GitHub pull requests must be merged'],
  ['requireGreenCi', 'CI must pass on linked pull requests'],
  ['requireSubtasksDone', 'All subtasks must be done'],
  ['requireBlockersDone', 'Blocking work items must be done'],
];

function Workflows() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { invoke('getWorkflows').then(setRows).catch((e) => setError(e.message)); }, []);

  const toggle = async (w) => {
    setBusy(w.id);
    setError(null);
    try {
      setRows(await invoke('setGate', { workflowId: w.id, on: !w.gated }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack space="space.100">
      <Heading size="small">Done gate on workflows</Heading>
      <Text>Turning the gate on adds the Doneproof validator to every transition into a Done status of that workflow.</Text>
      {error && <SectionMessage appearance="error">{error}</SectionMessage>}
      {!rows ? <Spinner label="Loading workflows" /> : (
        <DynamicTable
          head={{ cells: [{ key: 'name', content: 'Workflow' }, { key: 'done', content: 'Transitions into Done' }, { key: 'state', content: 'Gate' }, { key: 'action', content: '' }] }}
          rows={rows.map((w) => ({
            key: w.id,
            cells: [
              { key: 'name', content: w.name },
              { key: 'done', content: w.doneTransitions.join(', ') },
              { key: 'state', content: <Lozenge appearance={w.gated ? 'success' : 'default'}>{w.gated ? 'On' : 'Off'}</Lozenge> },
              { key: 'action', content: w.editable
                ? <LoadingButton isLoading={busy === w.id} onClick={() => toggle(w)}>{w.gated ? 'Turn off' : 'Turn on'}</LoadingButton>
                : <Text size="small" color="color.text.subtle">System workflow</Text> },
            ],
          }))}
          emptyView="No workflows with a Done status found."
        />
      )}
    </Stack>
  );
}

const REPORTS = [
  ['Closed without proof', 'statusCategory = Done AND (doneproofProven != "yes" OR doneproofProven IS EMPTY) ORDER BY updated DESC'],
  ['Proven in the last 30 days', 'doneproofProven = "yes" AND doneproofVerifiedAt >= -30d ORDER BY updated DESC'],
  ['Low-confidence verdicts', 'doneproofConfidence < 0.8 ORDER BY updated DESC'],
];

function Reports() {
  return (
    <Stack space="space.100">
      <Heading size="small">Reports</Heading>
      <Text>Verdicts are indexed, so they work in JQL: doneproofProven, doneproofConfidence and doneproofVerifiedAt.</Text>
      <Inline space="space.100">
        {REPORTS.map(([label, jql]) => (
          <Button key={label} onClick={() => router.navigate(`/issues/?jql=${encodeURIComponent(jql)}`)}>{label}</Button>
        ))}
      </Inline>
    </Stack>
  );
}

function App() {
  const [config, setConfig] = useState(null);
  const [saved, setSaved] = useState(null);
  const { handleSubmit, register, getFieldId } = useForm();

  const load = () => invoke('getSettings').then(setConfig);
  useEffect(() => { load(); }, []);

  if (!config) return <Spinner label="Loading settings" />;
  const options = Object.entries(config.providers).map(([value, p]) => ({ value, label: p.label }));

  const submit = async (form) => {
    const rules = { threshold: config.rules.threshold };
    for (const [key] of RULES) rules[key] = config.rules[key];
    try {
      await invoke('saveSettings', { provider: config.provider, model: form.model, apiKey: form.apiKey, githubToken: form.githubToken, rules });
      setSaved({ ok: true });
      load();
    } catch (e) {
      setSaved({ ok: false, message: e.message });
    }
  };

  const setRule = (key, value) => setConfig({ ...config, rules: { ...config.rules, [key]: value } });
  const preset = config.providers[config.provider];

  return (
    <Box xcss={page}>
      <Stack space="space.300">
        <Stack space="space.100">
          <Heading size="medium">Doneproof settings</Heading>
          <Text>Doneproof asks an AI model whether the evidence on a work item proves each acceptance criterion, then a workflow validator blocks the move to Done until it does. Turn the gate on for the workflows your teams use below.</Text>
        </Stack>
        <Workflows />
        <Reports />
        {saved && <SectionMessage appearance={saved.ok ? 'success' : 'error'}>{saved.ok ? 'Settings saved.' : saved.message}</SectionMessage>}
        <Form onSubmit={handleSubmit(submit)}>
          <FormSection>
            <Heading size="small">AI provider</Heading>
            <Label labelFor="provider">Provider</Label>
            <Select inputId="provider" options={options} value={options.find((o) => o.value === config.provider)} onChange={(o) => setConfig({ ...config, provider: o.value })} />
            <Label labelFor={getFieldId('model')}>Model</Label>
            <Textfield {...register('model')} defaultValue={config.model} placeholder={preset.model} />
            <HelperMessage>{`Leave empty to use ${preset.model}.`}</HelperMessage>
            <Label labelFor={getFieldId('apiKey')}>API key</Label>
            <Textfield {...register('apiKey')} type="password" placeholder={config.hasKey ? 'Saved — enter a new key to replace it' : 'Paste your API key'} />
            <HelperMessage>Stored as a Forge secret and sent only to the provider above. Free tiers may let the provider use what you send to improve its models; use a paid key for confidential work.</HelperMessage>
          </FormSection>
          <FormSection>
            <Heading size="small">GitHub</Heading>
            <Label labelFor={getFieldId('githubToken')}>Access token (optional)</Label>
            <Textfield {...register('githubToken')} type="password" placeholder={config.hasGithubToken ? 'Saved' : 'Needed for private repositories'} />
            <HelperMessage>Public repositories work out of the box. Add a token with read access for private repositories.</HelperMessage>
          </FormSection>
          <FormSection>
            <Heading size="small">Done gate</Heading>
            <Label labelFor="threshold">{`Minimum verifier confidence: ${Math.round(config.rules.threshold * 100)}%`}</Label>
            <Range id="threshold" min={50} max={100} step={5} value={Math.round(config.rules.threshold * 100)} onChange={(v) => setRule('threshold', Number(v) / 100)} />
            {RULES.map(([key, label]) => (
              <Inline key={key} space="space.100" alignBlock="center">
                <Toggle id={key} isChecked={config.rules[key]} onChange={() => setRule(key, !config.rules[key])} />
                <Label labelFor={key}>{label}</Label>
              </Inline>
            ))}
          </FormSection>
          <FormFooter>
            <Button appearance="primary" type="submit">Save</Button>
          </FormFooter>
        </Form>
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
