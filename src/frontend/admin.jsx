import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Box, Button, Form, FormFooter, FormSection, Heading, HelperMessage, Label, Range, SectionMessage, Select, Spinner, Stack, Text, Textfield, Toggle, Inline, useForm, xcss } from '@forge/react';
import { invoke } from '@forge/bridge';

const page = xcss({ maxWidth: '640px' });

const RULES = [
  ['requireMergedPrs', 'Linked GitHub pull requests must be merged'],
  ['requireGreenCi', 'CI must pass on linked pull requests'],
  ['requireSubtasksDone', 'All subtasks must be done'],
  ['requireBlockersDone', 'Blocking work items must be done'],
];

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
          <Text>Doneproof asks an AI model whether the evidence on a work item proves each acceptance criterion, then a workflow validator blocks the move to Done until it does. Add “Doneproof gate” as a validator on your Done transition to turn the gate on.</Text>
        </Stack>
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
            <HelperMessage>{config.hasKey ? 'Stored as a Forge secret. It is sent only to the provider above.' : config.bundled ? 'Until you add a key, Doneproof uses its built-in Gemini access, so you can try it right away.' : 'Stored as a Forge secret. It is sent only to the provider above.'}</HelperMessage>
          </FormSection>
          <FormSection>
            <Heading size="small">GitHub</Heading>
            <Label labelFor={getFieldId('githubToken')}>Access token (optional)</Label>
            <Textfield {...register('githubToken')} type="password" placeholder={config.hasGithubToken ? 'Saved' : 'Needed for private repositories'} />
            <HelperMessage>Public pull requests work without a token.</HelperMessage>
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
