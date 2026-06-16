# Local DB

The project uses SQLite for local development.

## Default Path

```env
DATABASE_URL="file:../../dev.db"
```

With the current Prisma package location, this resolves to:

```text
packages/dev.db
```

## Initialize Local DB

```bash
pnpm db:local:init
```

This command:

- Pushes the Prisma schema to the local SQLite database.
- Seeds mock knowledge-base data.
- Creates the default shared workspace.
- Creates default bot settings for the shared workspace.

## Open Prisma Studio

```bash
pnpm db:studio
```

Use this to inspect workspace settings, users, conversations, messages, and logs locally.

## Production Note

SQLite is fine for local development, but it is not the right persistence layer for Vercel production. Before real multi-user launch, move the production database to Postgres, such as Neon or Supabase.
