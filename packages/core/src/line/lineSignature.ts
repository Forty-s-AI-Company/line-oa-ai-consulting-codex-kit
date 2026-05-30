import crypto from "node:crypto";

export function computeLineSignature(body: string, channelSecret: string): string {
  const hmac = crypto.createHmac("sha256", channelSecret);
  hmac.update(body);
  return hmac.digest("base64");
}

export function verifyLineSignature(input: {
  body: string;
  channelSecret: string;
  signatureHeader: string | undefined;
}): boolean {
  if (!input.signatureHeader) return false;
  const expected = computeLineSignature(input.body, input.channelSecret);
  // timing safe compare
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

