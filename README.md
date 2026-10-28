# Doneproof

**Jira work moves to Done only when its acceptance criteria are proven.**

A ticket marked Done is a claim. Doneproof checks it: it reads the work item's acceptance criteria, gathers the evidence (linked GitHub pull requests with their merge state, CI checks and diff, comments, links, subtasks, blockers), asks an AI model whether each criterion is actually proven, and then a Jira workflow validator blocks the move to Done until it is.

The AI only assesses. Whether the work item may move is decided by deterministic rules in the app:

| Rule | Passes when |
|---|---|
| Acceptance criteria are written down | The description has an "Acceptance criteria" (or "Definition of done") list |
| Every criterion is proven | The latest AI verdict marks every criterion as proven |
| Verifier confidence | The verdict's confidence is at or above the threshold (80% by default) |
| Nothing changed since the verification | The criteria, comments, links, subtasks and pull requests (head commit, merge and CI state) are the same as when the verdict was made |
| Linked pull requests are merged | Every linked GitHub PR is merged |
| CI passed | Every linked PR's check runs completed without failures |
| Subtasks and blockers are done | No open subtasks and no unresolved "is blocked by" links |

If anything can't be evaluated, the transition is blocked rather than allowed.

## How it works

```
 Work item ──► Doneproof panel ──► "Verify with AI"
                                       │
                                       ▼
                             Forge queue worker
              collects evidence from Jira + GitHub (PR state, CI, diff)
              asks the AI model for a verdict per criterion
              stores the verdict + an evidence fingerprint on the work item
                                       │
 Transition to Done ──► Doneproof gate (workflow validator)
              re-collects the evidence now, compares the fingerprint,
              applies the rules ──► allow, or block with the reasons
```

- **Issue panel** (UI Kit): criteria with ✓/✕ and a one-sentence reason each, the evidence found, and the gate checklist.
- **Workflow validator** "Doneproof gate": add it to the Done transition.
- **Rovo agent** "Doneproof" with two actions, *Check if a work item is done* and *Verify a work item*, on sites with Rovo. The same actions are exposed as **MCP tools** (`rovo:mcp`) so other agents can ask whether work is really done.
- **Settings page** (Jira admin → Apps → Doneproof settings): AI provider, API key, optional GitHub token for private repositories, confidence threshold, and which rules apply.

## Install and set up

1. Install Doneproof on your Jira Cloud site.
2. In **Jira settings → Work items → Workflows**, edit the workflow, open the transition to **Done**, add a validator and choose **Doneproof gate**.
3. Write acceptance criteria as a bullet list under an **Acceptance criteria** heading in the description, and link the pull request (paste its URL as a link or in a comment).
4. Open the **Doneproof** panel on the work item and click **Verify with AI**.

Doneproof works out of the box with a built-in Gemini model. To use your own provider, open **Doneproof settings** and pick Google Gemini, OpenAI, Anthropic, Groq, OpenRouter or Mistral, then paste an API key. Keys are stored as Forge secrets and sent only to that provider.

## What data leaves Jira

When you click **Verify**, the work item's summary, acceptance criteria, description, latest 20 comments, link titles and URLs, attachment names, subtask and blocker statuses, and the linked pull requests' title, description, CI results and up to 6,000 characters of diff are sent to the configured AI provider. Nothing is sent at any other time. GitHub is read through its public API (or with your token for private repositories).

## Development

```bash
npm install
npm test                       # unit tests for criteria parsing, verdict normalisation and the gate
forge deploy && forge install  # needs the Forge CLI and an Atlassian developer site
forge variables set --encrypt DONEPROOF_AI_KEY <gemini key>   # optional built-in provider
```

Code map: `src/lib/adf.js` (criteria from the description), `src/lib/evidence.js` (Jira + GitHub evidence and the fingerprint), `src/lib/verifier.js` (AI call and fail-closed normalisation), `src/lib/policy.js` (the gate), `src/index.js` (resolvers, queue worker, validator, Rovo actions), `src/frontend/` (panel and settings).

A demo repository with a real pull request and CI is at [deadmist999/shop-checkout-demo](https://github.com/deadmist999/shop-checkout-demo).

## License

MIT
