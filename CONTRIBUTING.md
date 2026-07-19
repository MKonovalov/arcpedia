<!-- generated-by: gsd-doc-writer -->
# Contributing to arcpedia

arcpedia's code is written entirely by an autonomous agent pipeline (`arc`), not by human
contributors submitting pull requests. Six specialized agents (PM, Office Hour, Build,
Review, Architect, Research) plan, implement, and review changes on a schedule, driven by
GitHub Issues. See the [`README.md`](README.md) "How the Agents Work" section and
[`ARC.md`](ARC.md) for the full pipeline description.

This means the primary way to contribute is **filing an issue**, not opening a PR. This
doc explains that flow, plus how to set up the project locally if you want to run, read,
or fork the code yourself.

## How to Contribute (Steer the Agents)

1. [File an issue](https://github.com/MKonovalov/arcpedia/issues/new) describing the bug,
   feature, or change you want. There is no fixed issue template — describe the problem
   or idea, why it matters, and any acceptance criteria you have in mind.
2. The **Office Hour** agent triages open issues (`triage` label) against a taste filter —
   forcing questions, banned phrases, push-back patterns — and either approves it to
   `ready`, routes it to `needs-architecture` for decomposition, or asks a clarifying
   question in the issue thread.
3. Once an issue is labeled `ready`, the **Build** agent claims it, implements the
   smallest correct change, runs the build/lint/test suite, and opens a PR.
4. The **Review** agent evaluates the PR diff against the issue's acceptance criteria and
   either merges it or requests a fix (up to 5 automated attempts before an automatic
   revert and re-queue).

You can also let the **PM** agent drive without any issue from you — it scans the project
daily and files its own work. Filing an issue is how you steer that default direction.

## Reporting Bugs and Requesting Features

Use [GitHub Issues](https://github.com/MKonovalov/arcpedia/issues) for both bug reports
and feature requests. There are no issue templates in `.github/ISSUE_TEMPLATE/`, so
include what you'd normally put in a bug report by hand:

- What you expected to happen vs. what actually happened
- Steps to reproduce (for bugs)
- Relevant environment details (Node version, LLM provider, browser) if applicable
- Any relevant links, screenshots, or log output

Issues move through labels applied by the agents: `triage` → `ready` → `in-progress` →
closed, or `blocked` / `human-action` if the agent needs something only a human can
provide (a credential, a decision, external access). If you see a `human-action` issue,
it's asking for your input directly — closing it signals the blocked work can resume.

## Pull Requests

Only the **Build** agent opens PRs against this repository. The **Review** workflow
(`.github/workflows/review.yml`) only auto-reviews PRs from branches whose name starts
with `arc/`, opened from this repository (not forks) — that's how automated review and
merge is gated.

<!-- VERIFY: whether human-submitted PRs from a fork are reviewed or merged manually is not documented in-repo; if you want to propose code directly rather than steering via an issue, open an issue first to discuss it. -->

## Development Setup

For prerequisites, environment variables, and running the app locally, see the
"Run It Locally" and "Prerequisites" sections in [`README.md`](README.md):

```bash
git clone https://github.com/MKonovalov/arcpedia.git
cd arcpedia
corepack enable   # picks up the pnpm version pinned in package.json
pnpm install
pnpm dev          # http://localhost:3000
```

You'll need `.env.local` populated with at least one LLM provider key and Clerk auth
keys — see [`.env.example`](.env.example) and [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md)
for the full list.

## Coding Standards

- **Linting:** ESLint, configured in [`eslint.config.mjs`](eslint.config.mjs), extending
  `next/core-web-vitals` and `next/typescript`. Run it with:

  ```bash
  pnpm lint
  ```

- **Tests:** Vitest, configured in [`vitest.config.ts`](vitest.config.ts), covering every
  `*.test.ts` file under `src/**/__tests__/`. Run the suite with:

  ```bash
  pnpm test
  ```

- The Build agent runs lint and test as part of every implementation task before opening
  a PR, and the Review agent's acceptance check includes these results — code that fails
  lint or tests does not get merged.

## License

By having your issue implemented, the resulting code is contributed under the project's
[MIT License](LICENSE).
