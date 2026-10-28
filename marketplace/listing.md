# Doneproof — Marketplace listing

Everything to paste into the Marketplace partner portal. Limits are from Atlassian's listing principles; `check.py` in this folder verifies them.

## Basics

- **App name:** Doneproof - Verified Done for Jira
- **Tagline:** Jira work moves to Done only when an AI check of the evidence proves every acceptance criterion.
- **Summary:** Doneproof reads each work item's acceptance criteria, checks them against linked GitHub pull requests, CI, comments and subtasks with your AI provider, and blocks the Done transition until every criterion is proven.
- **Hosting:** Cloud (Forge)
- **Product:** Jira
- **Payment model:** Free
- **Category:** Project management / Workflow (pick the closest in the new categorization: "Workflow & automation")
- **Keywords:** definition of done, acceptance criteria, workflow validator, quality gate, pull request, CI, AI, Rovo, MCP
- **App logo:** `logo-144.png` (144x144)
- **Documentation URL:** https://github.com/deadmist999/doneproof#readme
- **Support URL:** https://github.com/deadmist999/doneproof/issues
- **Privacy policy URL:** https://github.com/deadmist999/doneproof/blob/main/PRIVACY.md
- **EULA / terms URL:** https://github.com/deadmist999/doneproof/blob/main/TERMS.md
- **Source code:** https://github.com/deadmist999/doneproof (MIT)
- **Demo video:** the YouTube link of the Codegeist demo, once uploaded

## Highlights

1. **Title:** Proof for every acceptance criterion
   **Summary:** Click Verify and Doneproof checks each criterion against the real evidence: linked pull requests with their diff, tests and CI, plus comments, links and subtasks. Each criterion gets a pass or fail and one-line reason.
   **Image:** `highlights/1-proof-per-criterion.png`

2. **Title:** Done waits until the work is proven
   **Summary:** A workflow validator blocks the move to Done while a criterion is unproven, a PR is unmerged or CI is red, and tells people exactly what is missing. Turn it on for a workflow with one click.
   **Image:** `highlights/2-done-waits-for-proof.png`

3. **Title:** Knows when the evidence changed
   **Summary:** A verdict is tied to the evidence it saw. A new commit, comment, merge or CI result marks it out of date and names the change, so an old pass can't carry new work through.
   **Image:** `highlights/3-knows-what-changed.png`

## More details (long description)

A ticket marked Done is a claim. Doneproof checks it.

**How it works**
1. Write acceptance criteria as a bullet list under an "Acceptance criteria" (or "Definition of done") heading in the description, and link the pull request.
2. Open the Doneproof panel and click **Verify**. Doneproof gathers the evidence — linked GitHub pull requests with merge state, review approvals, CI check results and the changed code, plus comments, links, attachments, subtasks and blockers — and asks your AI model whether each criterion is proven.
3. Moving the work item to Done runs the Doneproof gate. It re-reads the evidence, makes sure nothing changed since the verdict, and applies your rules: every criterion proven, confidence above your threshold, PRs merged, CI green, subtasks and blockers done. If any rule fails, the transition is blocked with the reasons.

**The AI assesses, the rules decide.** The model only judges evidence against criteria. Whether a work item may move is decided by deterministic rules you control, and anything that can't be evaluated blocks rather than allows.

**Built for teams and admins**
- One-click setup: turn the gate on per workflow from Doneproof settings; it is added to every transition into a Done status.
- Bring your own AI provider: Google Gemini, OpenAI, Anthropic, Groq, OpenRouter or Mistral. Your key is stored as a Forge secret and data goes only to that provider.
- JQL on verdicts: `doneproofProven`, `doneproofConfidence` and `doneproofVerifiedAt` power filters and dashboards such as "closed without proof".
- Verification history shows how a work item went from 0 of 3 to 3 of 3 proven.
- Rovo agent and MCP tools (on Rovo-enabled sites): ask "is SHOP-42 really done?" or let any agent call Doneproof.

**Requirements:** an API key from one of the supported AI providers. Public GitHub repositories work out of the box; add a read-only GitHub token for private ones.

## Screenshots (1840x900) and captions

1. `screenshots/1-criteria-proven.png` — Each acceptance criterion with a pass or fail and the evidence behind it: here the pull request's code and tests prove all three, so the work item is Ready for Done.
2. `screenshots/2-done-blocked.png` — Moving unproven work to Done is blocked by the Doneproof gate, which says what is missing and where to look.
3. `screenshots/3-evidence-changed.png` — The Done gate checklist. The pull request was merged after the last verdict, so Doneproof marks the verdict out of date and names the change.
4. `screenshots/4-one-click-gate.png` — Admins turn the Done gate on per workflow with one click. Doneproof adds its validator to every transition into a Done status.
5. `screenshots/5-ai-provider.png` — Choose your AI provider and model, set the confidence threshold and decide which rules the gate enforces.
6. `screenshots/6-jql-report.png` — Verdicts are indexed for JQL, so reports like "proven in the last 30 days" or "closed without proof" are one click away.

## Privacy & security tab

- **Does the app store personal data?** Yes, minimal: the Atlassian account ID of the person who requested each verification. No names, emails or content copies.
- **Where is data stored?** Only in the customer's Atlassian site: Forge storage (settings, encrypted secrets, verdicts, history) and a Jira issue property per verified work item.
- **Does the app transmit data outside Atlassian?** Yes, only on request: work item content and linked pull request data go to the AI provider the admin configured, with the admin's key. Pull request data is read from api.github.com.
- **External domains (egress):** api.github.com; one AI provider chosen by the admin from generativelanguage.googleapis.com, api.openai.com, api.anthropic.com, api.groq.com, openrouter.ai, api.mistral.ai.
- **Data retention:** verdicts live until the work item is deleted or the app is uninstalled; history keeps the last 10 verifications per work item.
- **Developer access to customer data:** none. The developer runs no backend.
- **Encryption:** provider keys and GitHub tokens are Forge secrets; transport is HTTPS.
- **Logging:** Forge platform logs only; the app does not log work item content.
- **Data residency:** Forge storage follows the site's data residency where supported.

## Scopes and why

| Scope | Why |
|---|---|
| `read:jira-work` | Read the work item's description, comments, links, subtasks and blockers to collect evidence |
| `write:jira-work` | Store the verdict as an issue property so JQL and the Done gate can use it |
| `read:jira-user` | Check whether the person opening settings is a Jira admin |
| `manage:jira-configuration` | Add or remove the Doneproof validator on workflow Done transitions (one-click gate) |
| `storage:app` | Keep settings, encrypted keys, verdicts and history in Forge storage |

## Partner profile (user's steps)

1. Create the partner (vendor) profile at https://marketplace.atlassian.com/manage/vendors/create with a support contact registered on developer.atlassian.com.
2. Complete the partner verification ticket and the Privacy & Security tab (answers above).
3. Developer console → Doneproof → Distribution: enable sharing, then link the app to the new listing.
4. Create the listing with the fields above, submit for review, and copy the review ticket URL for Devpost.
