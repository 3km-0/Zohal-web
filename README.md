# Zohal Web

Status: Active
Last reviewed: 2026-04-26

Web companion for the Zohal document and acquisition workspace platform. Built
with Next.js 15, React 19, TypeScript, Tailwind, next-intl, and Supabase SSR
auth.

## Repo Layout

This is a separate git repository from `zohal-core/` and `zohal-platform/`.
Commit and push changes inside each repo.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Product Model

The shared product model is:

`Document -> Template -> Run -> Snapshot -> Living Interface -> Automation`

Web uses the same product language as iOS and core docs:
- `Living Interface` for public/product language
- `Surface` for internal runtime/delivery language
- `Template` publicly
- `playbook` only for persistence/API details
- `Corpus` for curated source sets

The web app does not expose an end-user Pipeline Builder during the acquisition
reset.

## Main Areas

- authenticated workspace and property/acquisition flows
- Sources / document management
- operator and Ask flows
- settings, billing, and subscription UI
- Living Interface publication controls for the active `market` family
- web-side GCP backend service code under `services/zohal-backend/`

## Commands

```bash
npm run typecheck
npm run build
npm run test:run
```

Run the narrowest useful check after small changes. Run typecheck/build after
substantive web UI or API-contract changes.

## Environment Variables

Local development usually needs:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Before adding new variables, check existing Vercel/Firebase/GCP/Supabase names
and prefer documented aliases over duplicate secrets.

## Documentation

Start with:

- `../zohal-platform/Documentation/README.md`
- `../zohal-platform/Documentation/Architecture/architecture.md`
- `../zohal-platform/Documentation/Templates/Document-Templates.md`
- `../zohal-platform/Documentation/Quality/Agent_E2E_Smoke_Playbook.md`
- `../zohal-platform/Documentation/Surface/README.md`
- `docs/acquisition-playwright-runtime.md`

For repo-local workflow rules, read `AGENTS.md`.
