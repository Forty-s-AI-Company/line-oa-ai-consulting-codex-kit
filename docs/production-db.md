# Production DB Migration Plan

This project currently keeps local development on SQLite.

Production should move to Postgres before real multi-user launch because Vercel serverless storage is ephemeral.

## Current State

- Local DB: SQLite at `packages/dev.db`
- Local schema: `packages/db/prisma/schema.prisma`
- Production-ready Postgres schema: `packages/db/prisma/schema.postgres.prisma`
- Production deployment uses Supabase Postgres.

## Selected Provider: Supabase

Use Supabase Postgres for production.

The production app is running on Supabase Postgres. Local development still uses SQLite by default.

## Required Environment Variables

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://USER:PASSWORD@HOST:5432/postgres
```

Keep both URLs only in Vercel environment variables. Do not commit them.

## Supabase Connection Strings

For Vercel serverless runtime, use Supabase's transaction pooler for `DATABASE_URL`.

For Prisma schema operations, use a direct or session pooler URL for `DIRECT_URL`.

Recommended mapping:

- `DATABASE_URL`: Supavisor transaction pooler, usually port `6543`, with `pgbouncer=true&connection_limit=1`.
- `DIRECT_URL`: Supabase direct connection or session pooler, usually port `5432`.

Reference:

- [Supabase Postgres connection docs](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Prisma guide](https://supabase.com/docs/guides/database/prisma)

## Dry Run Locally

After you have a temporary Postgres connection string:

```bash
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
$env:DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
pnpm db:postgres:generate
pnpm db:postgres:push
pnpm db:postgres:seed
```

On macOS/Linux:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require" DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require" pnpm db:postgres:generate
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require" DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require" pnpm db:postgres:push
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require" DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require" pnpm db:postgres:seed
```

## Production Cutover Steps

1. Create a Supabase project.
2. Copy the transaction pooler connection string and set it as Vercel `DATABASE_URL`.
3. Copy the direct or session pooler connection string and set it as Vercel `DIRECT_URL`.
4. Run `pnpm db:postgres:push` against Supabase, or execute the generated Prisma SQL in Supabase SQL Editor if secrets cannot be read locally.
5. Run `pnpm db:postgres:seed`, or execute equivalent seed SQL once to create the default workspace and bot settings.
6. Deploy. The build script auto-generates Prisma Client from `schema.postgres.prisma` when `DATABASE_URL` starts with `postgres`.
7. Verify:
   - `/healthz`
   - `/liff/config`
   - `/admin/workspaces`
   - LINE webhook reply
   - LIFF workspace claim

## Current Cutover Notes

Vercel sensitive environment variables cannot be pulled back with their plaintext values. If local Prisma commands cannot read the real values, use Supabase SQL Editor for schema bootstrap and seed, then deploy normally so Vercel can use the encrypted production variables at runtime.
