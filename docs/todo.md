# Todo

## Required Before Real Multi-User Launch

- Replace the temporary Vercel SQLite runtime database with a persistent database, such as Neon Postgres or Supabase Postgres.
- Set a strong production `ADMIN_API_KEY`; do not keep `dev-admin-key`.
- Add LIFF identity verification so users can log in with LINE and only manage their own workspace.
- Add per-workspace usage logging and quota checks before calling external AI providers.
- Add owner invite / workspace claim flow for users who want Mode A.

## Product Improvements

- Make the LIFF admin UI mobile-first and friendlier for non-technical users.
- Add a guided setup wizard:
  - Choose Mode B or Mode A.
  - Paste Gemini API key.
  - Test one question.
  - Show LINE channel connection status.
- Add AI provider choices beyond Gemini after the credential model is stabilized.
- Add billing/cost dashboard per workspace.

## Operations

- Add production database migration workflow.
- Add webhook diagnostics page for recent LINE events.
- Add alerting for failed LINE replies and AI provider errors.
