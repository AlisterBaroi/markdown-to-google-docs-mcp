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
We actively welcome your pull requests.
1. Fork the repo and create your branch from `main`.
2. Follow the development setup instructions in the `README.md`.
3. If you've added code that should be tested, add tests.
4. If you've changed APIs or core features, update the documentation.
5. Ensure the test suite passes (if applicable).
6. Make sure your code lints.
7. Issue that pull request!

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
