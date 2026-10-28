# Codegeist 2026 — Devpost submission

## Basics

- **Project name:** Doneproof
- **Tagline (elevator pitch):** Jira work moves to Done only when its acceptance criteria are proven by the evidence.
- **Category:** Apps for Software Teams
- **Bonus prizes:** Best Rovo Agent, Best MCP App, Best Marketplace Published App
- **Video:** YouTube link (to add)
- **Installation link:** Developer console → Doneproof → Distribution → installation link (to add)
- **Marketplace:** listing link or review ticket link (to add)
- **Code:** https://github.com/deadmist999/doneproof
- **Demo repository:** https://github.com/deadmist999/shop-checkout-demo
- **Built with:** atlassian-forge, forge-ui-kit, jira, rovo, mcp, javascript, node.js, github-api, gemini, openai, anthropic

## About the project

### Inspiration

Every team has tickets marked Done that aren't really done: the pull request is still open, CI is red, or one of the acceptance criteria was quietly skipped. "Done" in Jira is a claim, and nobody checks it until something breaks in production. We wanted Jira to check it.

### What it does

Doneproof turns the Definition of Done into a gate that's enforced.

- **Verify.** In the Doneproof panel on a work item, one click reads the acceptance criteria from the description and gathers the evidence: linked GitHub pull requests (merge state, review approvals, CI check results and the changed code), comments, links, attachments, subtasks and blockers. An AI model then judges each criterion against that evidence and returns pass or fail with a one-line reason.
- **Gate.** A Jira workflow validator runs on every transition into Done. It re-reads the evidence, checks that nothing changed since the verdict, and applies deterministic rules: every criterion proven, confidence above the threshold, PRs merged, CI green, subtasks and blockers done. If a rule fails, the move is blocked and the message says exactly what's missing.
- **Out-of-date detection.** Each verdict carries a fingerprint of the evidence it saw. A new commit, comment, merge or CI result marks it out of date and names the change ("PR #2: open → merged", "1 new comment"), so an old pass can't carry new work through.
- **Admin settings.** Turn the gate on per workflow with one click. Choose the AI provider (Gemini, OpenAI, Anthropic, Groq, OpenRouter, Mistral) with your own key, set the confidence threshold and pick which rules apply.
- **JQL and history.** Verdicts are indexed (`doneproofProven`, `doneproofConfidence`, `doneproofVerifiedAt`), so filters like "closed without proof" are a click away. Verification history shows the work item going from 0/3 to 2/3 to 3/3.
- **Rovo agent and MCP.** A Doneproof Rovo agent with two actions ("Check if a work item is done", "Verify a work item"), also exposed as MCP tools through `rovo:mcp` so any agent can ask whether work is really done.

The design principle: **the AI assesses, the code decides.** The model never moves a ticket; rules you control do, and anything that can't be evaluated blocks instead of allowing.

### How we built it

Doneproof is a Forge app on the Node.js 24 runtime.

- **UI Kit** for the issue panel and the admin page.
- **Forge queue consumer** for verification. AI calls can take longer than the 25-second limit for UI resolvers, so the panel enqueues a job and polls for the result; the worker has a 300-second timeout.
- **Workflow validator** module for the gate, plus `/rest/api/3/workflows/update` to add it to every Done transition from the settings page.
- **Forge KVS** for settings, encrypted keys, verdicts and history. **Issue properties** plus a `jira:entityProperty` index make verdicts searchable with JQL.
- **`rovo:agent`, `action` and `rovo:mcp`** modules for agents.

The AI layer talks to any OpenAI-compatible endpoint, retries overloaded responses with backoff, and normalizes the model's answer so that a missing, malformed or partial verdict counts as "not proven".

### Challenges we ran into

- **Eventual consistency.** Jira serves issue properties eventually consistent, so the panel sometimes showed the previous verdict right after a verification. We now keep the verdict in Forge storage as well and show whichever is newer.
- **Shared egress IPs.** Unauthenticated GitHub calls from Forge hit rate limits because many apps share the same IPs. When GitHub can't be read, verification now refuses to run and the gate blocks, instead of letting the model guess without the PR.
- **Data responsibility.** We first shipped a built-in free-tier AI key so a fresh install worked instantly. Reading the provider terms showed that free tiers may train on submitted content and can't be offered in some regions, so every site now brings its own key and decides which provider sees its work items.
- **No Rovo on our developer site.** Our free developer site doesn't have Rovo, so we couldn't run the agent in chat. The agent's actions and the MCP tools call the same functions as the panel, and those are what we tested end to end.

### Accomplishments that we're proud of

- An end-to-end flow on a real Jira site and real GitHub repository: 0/3 → blocked → PR opened → 2/3 → merged → 3/3 → Done.
- The gate is fail-closed everywhere: unreadable evidence, a stale verdict or a malformed AI answer all block.
- "Out of date" explains itself in plain language instead of just saying "changed".

### What we learned

Making the AI one input to deterministic rules, rather than the decision-maker, made the system easier to trust and to explain. Forge's queue, storage and validator modules covered the whole design without any external backend.

### What's next for Doneproof

- More evidence sources: Bitbucket and GitLab pull requests, Confluence test reports, deployments.
- Per-project rules and criteria templates.
- A dashboard gadget for "closed without proof" trends.
- Marketplace listing (submitted for review).

## Testing instructions for judges

1. Install with the installation link above on a Jira Cloud site.
2. **Jira settings → Apps → Doneproof settings**: choose a provider, paste an API key and click **Save**. A free Gemini key from https://aistudio.google.com works for a quick test, but use it with test data only, since Google may use free-tier content. Then click **Turn on** next to your project's workflow.
3. Create a work item whose description has an "Acceptance criteria" heading with a bullet list. Paste a GitHub pull request URL as a link (for example a PR from https://github.com/deadmist999/shop-checkout-demo).
4. Open **Doneproof** from the work item's app actions and click **Verify with AI**. Then try moving it to Done.
