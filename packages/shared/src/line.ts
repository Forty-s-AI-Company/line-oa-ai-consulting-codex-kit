import { z } from "zod";

// Minimal subset for MVP: text message events.
export const LineTextMessageEventSchema = z.object({
  type: z.literal("message"),
  replyToken: z.string(),
  timestamp: z.number(),
  source: z.object({
    type: z.enum(["user", "group", "room"]),
    userId: z.string().optional()
  }),
  message: z.object({
    id: z.string(),
    type: z.literal("text"),
    text: z.string()
  })
});

export type LineTextMessageEvent = z.infer<typeof LineTextMessageEventSchema>;

export const LineWebhookBodySchema = z.object({
  destination: z.string().optional(),
  events: z.array(z.unknown())
});

export type LineWebhookBody = z.infer<typeof LineWebhookBodySchema>;

