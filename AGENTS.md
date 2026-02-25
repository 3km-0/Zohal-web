# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Zohal Web is a frontend-only Next.js 15 application (React 19, TypeScript 5.7) for the Zohal AI document platform. The backend is a hosted Supabase instance (separate `zohal-core` repo). See `README.md` for project structure and conventions.

### Environment variables

A `.env.local` file must exist with at least `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Without real Supabase credentials, the app renders all pages but auth/data operations will fail. The dev server starts fine with placeholder values.

### Running the app and checks

All standard npm scripts are in `package.json`:

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (port 3000) |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm run test:run` |
| Build | `npm run build` |

### Non-obvious notes

- The CI (`ci.yml`) uses Node 20. Use `nvm use 20` to match.
- `npm run lint` has one known pre-existing warning in `ContractAnalysisPane.tsx` (unnecessary `useMemo` dependency). This is non-blocking.
- The root route (`/`) redirects (307) to `/auth/login` via Next.js middleware when unauthenticated. Public pages are at `/home`, `/terms`, `/privacy`, `/support`.
- The build emits Supabase Edge Runtime warnings about `process.version`; these are upstream library warnings and safe to ignore.
- `npm run build` runs with `--no-lint` flag in CI; a separate lint step handles changed-file-only strict linting.
