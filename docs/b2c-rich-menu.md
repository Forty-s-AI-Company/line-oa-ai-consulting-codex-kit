# B2C LINE Rich Menu

## Goal

The B2C LINE OA should guide users into self-service AI setup first.

If a user has not configured their own AI provider, webhook replies should be:

```text
請到設定設置AI。
```

The rich menu must make the setup path obvious.

## Recommended 6-Button Layout

Canvas: `2500 x 1686`

| Area | Label | Action |
| --- | --- | --- |
| Top left | AI 設定 | Open LIFF settings page |
| Top middle | 開始提問 | Message: `我想問健康顧問` |
| Top right | 營養建議 | Message: `外食族怎麼補充營養？` |
| Bottom left | 我的狀態 | Message: `我的AI設定狀態` |
| Bottom middle | 使用教學 | Message: `怎麼使用AI健康顧問？` |
| Bottom right | 客服協助 | Message: `我需要客服協助` |

## Create Rich Menu

Set env locally, then run:

```bash
LINE_CHANNEL_ACCESS_TOKEN=... LIFF_ID=... RICH_MENU_IMAGE_PATH=./assets/rich-menu-b2c.png node scripts/line-rich-menu-b2c.mjs
```

`RICH_MENU_IMAGE_PATH` is optional for dry setup, but LINE users will only see a polished rich menu after an image is uploaded.

## B2C Runtime Env

```env
B2C_REQUIRE_USER_AI=true
MODEL_CATALOG_UPDATING=false
```

When `MODEL_CATALOG_UPDATING=true`, webhook replies are:

```text
系統模型清單更新中，請稍後再試。
```

## Off-Peak Model Catalog Refresh

`vercel.json` runs:

```text
/cron/update-model-catalog
```

Daily at `20:00 UTC`, which is `04:00 Asia/Taipei`.

Current implementation exposes a stable model catalog for:

- Gemini
- ChatGPT / OpenAI
- DeepSeek

The next production step is replacing the static catalog with provider API refreshes and storing the latest catalog in the production database.
