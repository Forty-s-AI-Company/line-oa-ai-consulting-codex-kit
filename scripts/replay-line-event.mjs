/**
 * Mock LINE webhook replay.
 *
 * Usage:
 *   node scripts/replay-line-event.mjs "我想問營養"
 */

const msg = process.argv.slice(2).join(" ").trim();
if (!msg) {
  console.error('Usage: node scripts/replay-line-event.mjs "your message"');
  process.exit(2);
}

const apiBase = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const userId = process.env.LINE_USER_ID ?? "U-replay";

const body = {
  destination: "U-destination",
  events: [
    {
      type: "message",
      replyToken: "reply-token",
      timestamp: Date.now(),
      source: { type: "user", userId },
      message: { id: String(Date.now()), type: "text", text: msg }
    }
  ]
};

const res = await fetch(`${apiBase}/webhooks/line`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});
const text = await res.text();
console.log(res.status, text);
