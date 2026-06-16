# Progress

## 2026-06-16

- Completed Amway Knowledge Base RAG integration for LINE OA.
- Deployed LINE webhook API to `https://line-oa.carry-digital-nomad.in.net`.
- Verified LINE Developers webhook URL and enabled webhook delivery.
- Improved Traditional Chinese answer formatting and preserved UTF-8 request bodies.
- Added mixed workspace mode:
  - Mode B: shared default workspace uses platform-level LINE channel and fallback composer.
  - Mode A: dedicated workspace can store its own LINE channel credentials and AI provider key.
- Added encrypted credential storage for AI keys and LINE channel secrets.
- Added Gemini answer composer with safe fallback to the existing simple answer composer.
- Added admin APIs and admin UI at `/admin`.
- Added LIFF admin entry at `/liff/admin`.
- Created LINE Login channel `PureFit AI Admin`.
- Created LIFF app `PureFit AI Admin` with LIFF ID `2010405627-YY9AFIAV`.
- Added default bot settings initialization for the default workspace.
- Added local DB workflow scripts for SQLite development:
  - `pnpm db:local:init`
  - `pnpm db:seed`
  - `pnpm db:studio`
- Updated DB seed to create the default workspace and bot settings.
- Added LIFF user login flow for the admin page.
- Added LIFF workspace claim flow so a LINE user can create a dedicated Mode A workspace.
- Added owner-only LIFF APIs for updating AI credentials and bot settings.
- Added LINE webhook routing so a user with a claimed Mode A workspace uses their own workspace even when messaging the shared official account.
- Added tests for LIFF authentication, workspace ownership isolation, and webhook workspace routing.

## Verification

- `pnpm lint` passed before the LIFF setup phase.
- `pnpm test` passed before the LIFF setup phase.
- Production health endpoint returned `build: "multi-tenant-byok-v1"` after deployment.
- Production playground returned RAG-backed Traditional Chinese nutrition answers.
- Local DB can be initialized with SQLite before moving to a production database.
- LIFF owner binding is implemented with local SQLite and can be migrated to production Postgres later.
