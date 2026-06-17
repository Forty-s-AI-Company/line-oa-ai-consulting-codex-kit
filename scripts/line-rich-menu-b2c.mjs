import fs from "node:fs";

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const liffId = process.env.LIFF_ID;
const imagePath = process.env.RICH_MENU_IMAGE_PATH;

if (!channelAccessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is required");
if (!liffId) throw new Error("LIFF_ID is required");

const liffUrl = `https://liff.line.me/${liffId}`;

const richMenu = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "PureFit AI B2C Menu",
  chatBarText: "AI健康顧問",
  areas: [
    { bounds: { x: 0, y: 0, width: 833, height: 843 }, action: { type: "uri", label: "AI設定", uri: liffUrl } },
    { bounds: { x: 833, y: 0, width: 834, height: 843 }, action: { type: "message", label: "開始提問", text: "我想問健康顧問" } },
    { bounds: { x: 1667, y: 0, width: 833, height: 843 }, action: { type: "message", label: "營養建議", text: "外食族怎麼補充營養？" } },
    { bounds: { x: 0, y: 843, width: 833, height: 843 }, action: { type: "message", label: "我的狀態", text: "我的AI設定狀態" } },
    { bounds: { x: 833, y: 843, width: 834, height: 843 }, action: { type: "message", label: "使用教學", text: "怎麼使用AI健康顧問？" } },
    { bounds: { x: 1667, y: 843, width: 833, height: 843 }, action: { type: "message", label: "客服協助", text: "我需要客服協助" } }
  ]
};

async function lineFetch(path, init = {}) {
  const res = await fetch(`https://api.line.me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      ...(init.headers || {})
    }
  });
  if (!res.ok) throw new Error(`LINE API failed ${res.status}: ${await res.text()}`);
  return res;
}

const createRes = await lineFetch("/v2/bot/richmenu", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(richMenu)
});
const { richMenuId } = await createRes.json();

if (imagePath) {
  const image = fs.readFileSync(imagePath);
  const contentType = imagePath.toLowerCase().endsWith(".jpg") || imagePath.toLowerCase().endsWith(".jpeg")
    ? "image/jpeg"
    : "image/png";
  await lineFetch(`/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: { "content-type": contentType },
    body: image
  });
}

await lineFetch(`/v2/bot/user/all/richmenu/${richMenuId}`, { method: "POST" });

console.log(JSON.stringify({ ok: true, richMenuId, liffUrl, imageUploaded: Boolean(imagePath) }, null, 2));
