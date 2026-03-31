# Zohal-web Agent Notes

This file is the repo-local workflow guide for `Zohal-web`.

## Scope

- This repo owns the web client, operator-facing web UI, and the web-side
  backend service code under `services/zohal-backend/`.
- Use this repo for Next.js UI work, client-side analysis surfaces, workspace
  pages, and web-only operator flows.
- If the task changes iOS behavior, Supabase migrations, or core template
  runtime semantics, start in `zohal-core/` instead.

## Read first

- Start with `README.md`.
- Then use `../zohal-core/Documentation/README.md` for system docs and read only
  the relevant topic docs.

## Product and architecture posture

- The product model remains:
  `Document -> Template -> Run -> Snapshot -> Portal -> Automation`
- Preserve the core loops:
  - circle -> explain
  - solve -> workspace
  - unified chat + notes
  - evidence-grade analysis
- Treat web changes as part of one shared product with iOS; do not create a web
  behavior fork unless explicitly approved.

## Hosting and deploy posture

- Treat hosting and deployment config as high-caution surfaces.
- The migration direction is still:
  - current/legacy web hosting may involve Vercel
  - target direction is Firebase Next.js Hosting
- Do not casually edit hosting config, deployment scripts, env examples, or CI
  just because they are nearby.
- Do not trigger deploys or rebuilds unless the user explicitly asks.
- Avoid changes that would cause unnecessary production rebuild churn when the
  task is only product/UI logic.

## Git policy

- `main` is the shipping truth.
- `development` is the only allowed long-lived non-`main` branch.
- Any other branch must be short-lived and scoped to one task.
- Do not leave stale feature branches or stale worktrees behind.

## Merge policy

- Prefer small reviewed commits over merging broad stale branches.
- If a branch contains both safe UI improvements and risky backend/runtime
  changes, port the safe pieces and leave the risky parts out until reviewed.
- If behavior already exists on `main`, do not merge an old branch just because
  it contains similar earlier work.

## Web-specific guardrails

- Keep localization in sync. Do not add user-facing English-only strings unless
  explicitly approved.
- Prefer existing theme tokens and design-system primitives over ad-hoc styling.
- Keep `Workspace`, analysis, and template types aligned with live DB/API
  contracts.
- Be cautious in `services/zohal-backend/`: this code can affect live web flows,
  publication behavior, and experience routing.

## Verification

- Run `npm run typecheck` after substantive changes.
- Run targeted tests when nearby tests exist or the change affects runtime logic.
- If a change touches hosting/deploy config or backend service code, call that
  out explicitly in the final report even if the user did not ask for deployment.
