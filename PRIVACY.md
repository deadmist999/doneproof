# Doneproof privacy policy

Last updated: October 28, 2026

Doneproof is a Jira Cloud app built on Atlassian Forge. It runs entirely on Atlassian's Forge platform: the developer operates no servers, databases or analytics of its own and never receives your data.

## What Doneproof reads

When a person clicks **Verify** on a work item (or a Rovo agent asks Doneproof to verify one), Doneproof reads from that work item:

- the summary, description and acceptance criteria;
- the latest 20 comments;
- link titles and URLs, attachment names;
- the keys and statuses of subtasks and "is blocked by" work items;
- for up to three linked GitHub pull requests: title, description, base branch, merge state, head commit, review approvals, CI check results, and up to 6,000 characters of the changed files.

Pull request data is read from the GitHub API, with the access token an admin saved in Doneproof settings or, for public repositories, a read-only token bundled with the app.

The Done gate (the workflow validator) reads the same data again when someone moves a work item to Done, to check that nothing changed since the verdict. That check does not send anything to an AI provider.

## Where it goes

The data above is sent to **one** place: the AI provider an admin chose in Doneproof settings (Google Gemini, OpenAI, Anthropic, Groq, OpenRouter or Mistral), using that admin's own API key. It is sent only when a verification is requested. Doneproof does not include a shared AI key; nothing is sent to any provider until an admin adds one.

What the provider does with the data is governed by the agreement between your organization and that provider. Some providers' free tiers allow them to use submitted content to improve their models; use a paid key for confidential work.

## What Doneproof stores

All storage is inside your Atlassian site, in Forge storage and Jira issue properties:

| Data | Where | Kept until |
|---|---|---|
| The latest verdict per work item: per-criterion result and one-sentence reason, confidence, summary, model name, time, the Atlassian account ID of the person who requested it, and an evidence fingerprint (criteria text, comment IDs and edit times, link URLs, subtask/blocker keys and statuses, pull request URLs with head commit, merge, CI and approval state) | Jira issue property `doneproof` and Forge storage | the work item is deleted or the app is uninstalled |
| Verification history: time, criteria proven, confidence, model (last 10 per work item) | Forge storage | the app is uninstalled |
| Settings: provider, model, gate rules | Forge storage | the app is uninstalled |
| AI provider key and optional GitHub token | Forge secret storage (encrypted) | an admin clears them or the app is uninstalled |

Doneproof stores no copies of descriptions, comments or code.

Forge storage is hosted by Atlassian and follows your site's data residency settings where Forge supports them.

## Who can see it

Anyone who can view the work item can see its Doneproof verdict. Only Jira admins can change settings; saved keys are never shown again after saving.

## Your choices

- Admins can clear the AI key at any time; Doneproof then stops sending data anywhere.
- Uninstalling the app removes its Forge storage. Issue properties are removed when the work items are deleted.

## Contact

Questions or requests: open an issue at https://github.com/deadmist999/doneproof/issues, or use the contact details on the Doneproof Marketplace vendor profile for anything you'd rather not post publicly.
