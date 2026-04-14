# burnbadge
![](http://localhost:8787/api/badge/48cf83ed-5f41-4858-9508-1d2d0b4b08be/image?style=flat&logo=anthropic)

## Development

- Install dependencies with `npm install`.
- Export `BURNBADGE_SECRET` (any strong passphrase) before running the API server.
- Run `npm run typecheck` to ensure the domain modules compile.
- Use `npm test` (Vitest) to run unit tests.
- `npm run lint` enforces the repository style rules.
- `npm run dev` starts a local Hono server on `http://localhost:8787` for manual testing.
- `npm run build` then `npm start` serves the compiled output from `dist/`.

## Project Structure

- `src/lib` contains shared types and abstractions (e.g., `UsageProvider`).
- `src/providers` contains implementations for each provider (Anthropic and OpenRouter live, OpenAI stubbed).
- `src/index.ts` re-exports public types for downstream runtimes.
- `src/server` exposes a minimal Hono HTTP server with `/api/register`, `/api/badge/[token]`, `/api/chart/[token]`, `/api/usage/[token]`, and `/api/shields/[token]` routes.
- `src/storage` currently hosts an in-memory token store for development (swap for durable storage in production).

## Working with Real Providers

- `anthropicProvider` integrates with `GET https://api.anthropic.com/v1/usage/costs` to return normalized daily spend. Bring your own admin API key and set it during registration.
- `openrouterProvider` aggregates usage from `GET https://openrouter.ai/api/v1/activity`. This endpoint requires a **Management API key**; regular per-app keys will return HTTP 403. Create a management key in the OpenRouter dashboard and supply it during registration.
- `openrouterProvider` tracks sub-cent usage: totals are kept to four decimal places and badge output switches to cents for extremely small spend.
- `mockProvider` returns a prebuilt high-usage dataset for local testing. Register with `provider="mock"` to preview charts without touching external APIs.
- `openaiProvider` remains a placeholder — follow the Anthropic/OpenRouter patterns when implementing.

## Shields.io Badges

- Call `/api/shields/{token}` to generate badge metadata. The response includes the Shields.io image URL plus ready-to-copy Markdown and HTML snippets.
- `/api/shields/{token}/image` performs a 302 redirect to `https://img.shields.io/endpoint`, making it safe to embed directly as an image source.
- Both routes accept the same query parameters as `/api/badge` (`days`, `label`, `color`) and forward Shields extras like `style`, `logo`, `logoColor`, `labelColor`, `logoWidth`, `logoPosition`, `link`, and `cacheSeconds`.
- Example: `curl "http://localhost:8787/api/shields/{token}?label=AI%20Spend&style=flat"` returns helper snippets, while `![AI Spend](http://localhost:8787/api/shields/{token}/image?style=flat)` renders the dynamic badge.
