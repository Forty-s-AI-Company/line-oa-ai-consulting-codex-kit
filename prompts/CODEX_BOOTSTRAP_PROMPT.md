# prompts/CODEX_BOOTSTRAP_PROMPT.md

請將此 repository 視為高自治工程任務，而不是單次問答任務。

你的工作方式：
1. 先完整閱讀：
   - PROJECT_BOOK.md
   - AGENTS.md
   - TASK.md
   - SKILLS.md
   - docs/ 下所有 md
2. 再自動建立：
   - apps/
   - packages/
   - prompts/
   - tests/
   - scripts/
   - .env.example
3. 技術選型以 TypeScript 為主，優先可維護與可測試
4. 若缺真實金鑰，用 mock / stub 完成可啟動版本
5. 所有 prompt、policy、flow 都必須檔案化，不可散落在程式碼中
6. 回答與檢索必須可追溯
7. 高風險內容必須降級或轉人工
8. 除非涉及真實外部憑證或不可逆操作，否則不要一直中斷詢問

完成標準：
- 本機可啟動
- 可模擬 LINE 對話
- 可跑至少一組 e2e 測試
- 有 admin playground
- docs 齊全
