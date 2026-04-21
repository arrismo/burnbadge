# AGENTS.md

## Project shape (verified)
- Runtime is Cloudflare Workers + Hono; Worker entrypoint is `src/server/cf.ts` (`wrangler.toml` `main`).
- Core API wiring lives in `src/server/app.ts` via `createApp()`.
- Node entrypoint exists at `src/server/index.ts`; `npm start` runs compiled output at `dist/server/index.js`.
- This is a single-package npm repo (no monorepo/workspaces).

## Commands that matter
- Install: `npm ci` (CI uses this).
- Build: `npm run build` (TypeScript emits to `dist/`).
- Local worker dev: `npm run dev` (Wrangler).
- Verification order (matches deploy workflow): `npm run typecheck && npm run lint && npm test`.
- Run one test file: `npm test -- src/server/app.test.ts`.
- Run tests by name: `npm test -- -t "normalizeOpenRouterActivity"`.

## Environment and bindings
- `BURNBADGE_SECRET` is required for register/badge/usage/chart flows; missing secret returns 500.
- `BASE_URL` (or `BURNBADGE_BASE_URL` in local defaults) affects URLs returned by register/shields routes.
- Worker runtime expects KV binding `BURNBADGE_KV`; `src/server/cf.ts` returns 500 if binding is missing.

## Architecture notes agents usually miss
- Storage selection is runtime-dependent: `createApp()` uses in-memory storage unless KV storage is provided.
- Provider registry is centralized in `src/providers/registry.ts`.
- `openai` provider is registered but currently throws "not yet implemented" in `src/providers/openai.ts`.
- TypeScript source uses ESM with explicit `.js` import specifiers; keep that pattern in `.ts` files.

## Testing/linting quirks
- Vitest only includes `src/**/*.test.ts` (`vitest.config.ts`).
- ESLint enforces 2-space indent, semicolons, max line length 100, and trailing commas for multiline (`eslint.config.js`).
- Current tests are mostly unit-level normalization/app-route behavior and do not exercise live provider APIs.

## Repo workflow gotcha
- `.gitignore` includes `AGENTS.md`; updates may stay local unless the ignore rule is changed.
