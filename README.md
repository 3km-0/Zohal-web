# Zohal Web

Web companion for the Zohal document platform. Built with Next.js 14, React, and TypeScript.

## Repo layout (important)

This is a **separate git repository** from `zohal-core/` (which contains iOS + Supabase backend + core docs). Commit and push changes **inside each repo**.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (app)/             # Authenticated routes
│   │   ├── workspaces/    # Workspace pages
│   │   ├── search/        # Search page
│   │   └── settings/      # Settings & billing
│   ├── (auth)/            # Authentication routes
│   └── (public)/          # Public pages (home, terms, privacy)
├── components/
│   ├── ui/                # Base components (Button, Card, Toast)
│   ├── layout/            # AppShell, Header, Sidebar
│   ├── pdf-viewer/        # PDF viewing components
│   └── ai/                # AI panel components
├── lib/
│   ├── errors.ts          # Error handling utilities
│   └── supabase/          # Supabase client (browser/server)
└── types/                 # TypeScript types
```

## Key Conventions

### Error Handling
```typescript
import { mapErrorToUserFacing, showErrorToast } from '@/lib/errors'

try {
    await supabase.functions.invoke('endpoint', { body })
} catch (error) {
    const userError = mapErrorToUserFacing(error)
    showErrorToast(userError)
}
```

### Styling
- Use Tailwind CSS with Slate design language tokens
- No inline hex colors - use theme tokens
- Global toast for transient errors via `Toast` component

## Environment Variables

Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Internal Pipeline Builder flags (foundation)

```
NEXT_PUBLIC_PIPELINE_BUILDER_ENABLED=true
NEXT_PUBLIC_PIPELINE_BUILDER_WORKSPACE_ALLOWLIST=workspace_uuid_1,workspace_uuid_2
```

When enabled for a workspace, the internal scaffold is available at:

`/workspaces/<workspace_id>/pipelines`

### Presets UX (planned)
Pipeline presets (node “recipes” and starter certified pipelines) are intended to remain a **pure UX layer**:
- Preset nodes are prefilled configs for existing node kinds (no new runtime semantics).
- Certified starter pipelines are shipped as global system preset pipelines that users can duplicate/edit.

Delta-to-GA backend capabilities (consumed by scaffold and follow-up UX work):
- `pipelines-node-catalog`, `pipelines-validate-spec`, `pipelines-node-action`
- `pipeline-connections-test`
- `pipelines-get-artifact` (artifact pointer retrieval / signed access)

## Building for Production

```bash
npm run build
```

## Related Documentation

See the main project documentation in `../zohal-core/Documentation/`:
- [Engineering_Quality_Master_Plan.md](../zohal-core/Documentation/Engineering_Quality_Master_Plan.md)
- [architecture.md](../zohal-core/Documentation/architecture.md)
- [Zohal Design Language.md](../zohal-core/Documentation/Zohal%20Design%20Language.md)
