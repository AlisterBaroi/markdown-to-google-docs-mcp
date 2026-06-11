# Contributing to Markdown to Docs

First off, thank you for considering contributing to Markdown to Docs! It's people like you that make open source such a great community to learn, inspire, and create.

## Where do I go from here?

If you've noticed a bug or have a feature request, make sure to check if there's already an issue for it. If not, feel free to open a new issue!

## How can I contribute?

### Reporting Bugs
This section guides you through submitting a bug report for the project. Following these guidelines helps maintainers and the community understand your report, reproduce the behavior, and find related reports.
- Use a clear and descriptive title for the issue to identify the problem.
- Describe the exact steps which reproduce the problem in as many details as possible.
- Provide specific examples to demonstrate the steps.

### Suggesting Enhancements
This section guides you through submitting an enhancement suggestion, including completely new features and minor improvements to existing functionality.
- Use a clear and descriptive title for the issue to identify the suggestion.
- Provide a step-by-step description of the suggested enhancement in as many details as possible.
- Explain why this enhancement would be useful to most users.

### Pull Requests
We actively welcome your pull requests. **All changes flow through the `dev` branch — `main` never takes direct commits or PRs from feature branches** (see [Branching model](#branching-model--branch-protection) below).
1. Fork the repo and create your branch from **`dev`** (not `main`).
2. Follow the development setup instructions below / in the `README.md`.
3. If you've added code that should be tested, add tests.
4. If you've changed APIs or core features, update the documentation.
5. Ensure the test suite passes (`npm test`) and your code lints (`npm run lint`).
6. Open your pull request **against the `dev` branch**.
7. The repo owner reviews and approves — only the owner's approval can merge it.

## Branching model & branch protection

This project uses a two-tier branch model, enforced by GitHub branch rulesets:

- **`main`** — the production / deploy branch (a push to `main` triggers the Cloud Run deploy).
  - **No direct commits** — changes land only via pull request.
  - Force-pushes and branch deletion are blocked.
  - A PR can be merged **only after CI and the secret scan pass**.
  - PRs into `main` come **only from `dev`**, and are opened by the maintainer.
- **`dev`** — the integration branch where contributions are collected.
  - Branch deletion is blocked (direct commits by the maintainer are allowed).
  - PRs into `dev` **require review from the code owner** — only the repo owner's
    approval satisfies it (see [CODEOWNERS](CODEOWNERS)).

**Contribution flow:**

```
 your fork (feature branch)
        │   PR   ▼   ← repo owner's review required
       dev  ─────────────────►  main   ← maintainer-opened PR; merges only when CI is green
                                  │
                                  ▼   Cloud Run deploy
```

1. Branch off `dev` in your fork, make your changes, and open a PR **into `dev`**.
2. The repo owner reviews and approves; on merge, your work lands in `dev`.
3. The maintainer periodically opens a `dev → main` PR, which merges only when CI passes — and that merge deploys to production.

> CI and secret scanning run automatically on every push/PR to non-`main` branches; `main` itself is scanned on a nightly schedule.

## Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone <your-fork-url>
   cd markdown-to-docs
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Variables:**
   Copy the `.env.example` file to `.env` and fill in your Firebase configuration.
   ```bash
   cp .env.example .env
   ```

4. **Run the local development server:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

## Code Style
- We use Prettier/ESLint for code formatting and linting.
- Please make sure your code passes linting before submitting a PR: `npm run lint`

## Code of Conduct
Please note that this project is released with a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

Thank you for your contributions!
