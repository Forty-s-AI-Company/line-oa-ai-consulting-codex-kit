# Todo

## Required Before Real Multi-User Launch

- Add `PLATFORM_GEMINI_API_KEY` to Vercel production env for Mode B shared AI.
- Add `PLATFORM_GEMINI_MODEL` to Vercel production env if a model other than `gemini-3.5-flash` is desired.
- Set `B2C_REQUIRE_USER_AI=true` in production when switching from testing mode to B2C BYOK mode.
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
- Add per-provider model help text in the LIFF UI so users understand cost and stability tradeoffs before saving a model.
- Add inline validation for provider-specific API key format before calling the save API.
- Add billing/cost dashboard per workspace.

## Operations

- Add repeatable production database migration workflow instead of manual SQL Editor bootstrap.
- Replace static model catalog with real provider model API refresh and persist the latest catalog in DB.
- Add an admin-only compatibility migration notice for existing users still using DeepSeek legacy `deepseek-chat` / `deepseek-reasoner` before 2026-07-24.
- Add webhook diagnostics page for recent LINE events.
- Add alerting for failed LINE replies and AI provider errors.
- Add a safe rich menu rotation script so old test rich menus can be cleaned up after confirming the production menu.
