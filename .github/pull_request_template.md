## Summary
- What changed and why?

## Validation
- [ ] Typecheck passes locally (`npm run typecheck`)
- [ ] Lint passes locally (`npm run lint`)
- [ ] Build passes locally (`npm run build`)
- [ ] I tested the main user flow(s) affected by this change

## Merge Gate Checklist
- [ ] No silent failures added (swallowed errors, hidden rejected promises)
- [ ] User-facing errors are safe/friendly and localized
- [ ] No secrets/keys in logs, client code, or committed files
- [ ] API response handling remains backward-compatible and additive
- [ ] Tests were added/updated for behavior changes
- [ ] Any new user-facing strings were added to both locales (`messages/en.json`, `messages/ar.json`)
