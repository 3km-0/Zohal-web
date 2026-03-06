# AGENTS.md

## Cursor Cloud specific instructions

Zohal Web is a **frontend-only** Next.js 15 app (React 19, TypeScript). All backend logic lives in a separate Supabase project — there are no local databases or Docker services to run.

### Key commands

See `package.json` scripts. The important ones:

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (port 3000) |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Tests | `npm run test:run` |
| Build | `npm run build` |

### Non-obvious caveats

- The app requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` to start. Without real Supabase credentials, the dev server still starts and renders pages, but auth/data flows will fail at runtime.
- The root `/` route redirects (307) to `/auth/login` via middleware for unauthenticated users — this is expected behavior, not an error.
- CI runs `npm run build -- --no-lint` (lint runs separately on changed files only). The baseline `npm run lint` produces a single warning that is non-blocking.
- `next lint` is deprecated in Next.js 16; the repo still uses it via `npm run lint`. The deprecation notice is cosmetic.
- Supabase auth requires email verification for new signups. To test authenticated flows end-to-end, you need a pre-verified test account or access to the Supabase dashboard to confirm users manually.
- If port 3000 is occupied, Next.js silently falls back to 3001. Check terminal output for the actual port.
