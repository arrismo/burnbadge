# Push Model Migration

## Summary

Burnbadge no longer stores provider API keys.

The system now uses a push-based usage model:

- Burnbadge creates a project with a public `badgeToken` and private `usageToken`
- The user's own workflow fetches provider usage directly
- The workflow pushes normalized daily usage into Burnbadge using `usageToken`
- Burnbadge renders badge and chart responses from stored usage snapshots

## Why This Changed

The previous design required Burnbadge to store encrypted provider API keys in Cloudflare KV and decrypt them during badge requests.

That created an unnecessary trust and security burden.

The new model removes server-side provider credential storage entirely.

## New API Flow

### 1. Create a project

`POST /api/projects`

Request body:

```json
{
  "provider": "openrouter"
}
```

Response:

```json
{
  "token": "<badgeToken>",
  "badgeToken": "<badgeToken>",
  "usageToken": "<usageToken>",
  "badgeUrl": "https://your-domain/api/badge/<badgeToken>",
  "chartUrl": "https://your-domain/api/chart/<usageToken>",
  "usageUrl": "https://your-domain/api/usage/<usageToken>"
}
```

Notes:

- `token` is an alias for `badgeToken`
- `badgeToken` is public and intended for README badges
- `usageToken` is private and is required for data ingestion and token management

### 2. Push usage data

`POST /api/usage/:usageToken`

Request body:

```json
{
  "provider": "openrouter",
  "usage": [
    {
      "date": "2026-04-20",
      "cost": 1.25
    },
    {
      "date": "2026-04-21",
      "cost": 2.5,
      "breakdown": [
        {
          "model": "openai/gpt-4.1",
          "cost": 2.5
        }
      ]
    }
  ]
}
```

Behavior:

- Requires the private `usageToken`
- Replaces the stored usage window with the submitted normalized daily series
- Updates `updatedAt` on the project record

### 3. Read public and private resources

Public badge routes:

- `GET /api/badge/:badgeToken`
- `GET /api/shields/:badgeToken`
- `GET /api/shields/:badgeToken/image`

Private routes:

- `GET /api/usage/:usageToken`
- `GET /api/chart/:usageToken`
- `POST /api/tokens/:usageToken/rotate`
- `POST /api/tokens/:usageToken/revoke`

## GitHub Actions Model

The intended secure setup is:

1. User creates a Burnbadge project and receives tokens
2. User stores their provider API key in their own GitHub repository secrets
3. User stores these Burnbadge secrets in their repo:
   - `BURNBADGE_BASE_URL`
   - `BURNBADGE_BADGE_TOKEN`
   - `BURNBADGE_USAGE_TOKEN`
4. The repository workflow fetches usage directly from the provider
5. The workflow pushes usage snapshots to Burnbadge
6. The README badge uses `badgeToken`

## Compatibility Notes

- `POST /api/register` now behaves as a create-project alias for compatibility
- Legacy single-token records still remain readable and rotatable
- The old provider-fetch implementation has been removed from the runtime path

## Removed From The Server

These are no longer part of the Burnbadge server design:

- storing encrypted provider API keys
- decrypting provider API keys on requests
- live provider usage fetches during badge rendering
- provider registry resolution inside the server

## Verification

This migration was validated with:

```bash
npm run lint
npm run typecheck
npm test
```
