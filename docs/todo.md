# Todo

## Required Before Real Multi-User Launch

- Replace the temporary Vercel SQLite runtime database with a persistent database, such as Neon Postgres or Supabase Postgres.
- Set a strong production `ADMIN_API_KEY`; do not keep `dev-admin-key`.
- Set production `LIFF_ID` and `LIFF_CHANNEL_ID` environment variables.
- Add per-workspace usage logging and quota checks before calling external AI providers.
- Add owner invite / transfer flow for workspaces that need multiple admins.

## Product Improvements

- Continue polishing the LIFF admin UI after real-user testing.
- Fully remove the legacy unreachable inline HTML from `apps/api/src/server.ts` after a safe cleanup pass.
- Add a guided setup wizard:
  - Choose Mode B or Mode A.
  - Paste Gemini API key.
  - Test one question.
  - Show LINE channel connection status.
- Add AI provider choices beyond Gemini after the credential model is stabilized.
- Add billing/cost dashboard per workspace.

## Operations

- Add production database migration workflow.
- Add a Postgres migration branch after the local SQLite workflow is stable.
- Add webhook diagnostics page for recent LINE events.
- Add alerting for failed LINE replies and AI provider errors.
