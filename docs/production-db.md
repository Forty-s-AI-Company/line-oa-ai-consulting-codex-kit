# Production DB Migration Plan

This project currently keeps local development on SQLite.

Production should move to Postgres before real multi-user launch because Vercel serverless storage is ephemeral.

## Current State

- Local DB: SQLite at `packages/dev.db`
- Local schema: `packages/db/prisma/schema.prisma`
- Production-ready Postgres schema: `packages/db/prisma/schema.postgres.prisma`
- Production deployment is not switched to Postgres yet.

## Recommended Provider

Use one of these:

- Neon Postgres
- Supabase Postgres
- Vercel Marketplace Postgres-compatible provider

## Required Environment Variables

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

Keep the URL only in Vercel environment variables. Do not commit it.

## Dry Run Locally

After you have a temporary Postgres connection string:

```bash
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
pnpm db:postgres:generate
pnpm db:postgres:push
pnpm db:seed
```

On macOS/Linux:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require" pnpm db:postgres:generate
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require" pnpm db:postgres:push
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require" pnpm db:seed
```

## Production Cutover Steps

1. Create a Postgres database.
2. Add `DATABASE_URL` to Vercel production environment variables.
3. Update the Vercel build pipeline to generate Prisma Client from `schema.postgres.prisma`.
4. Run `pnpm db:postgres:push` against the production database.
5. Run seed once to create the default workspace and bot settings.
6. Deploy.
7. Verify:
   - `/healthz`
   - `/liff/config`
   - `/admin/workspaces`
   - LINE webhook reply
   - LIFF workspace claim

## Why Not Switch Automatically Now

Switching production to Postgres requires a real database connection string and deployment environment change. Until that exists, the safe path is to keep SQLite for local development and prepare the Postgres schema separately.
