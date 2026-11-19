export * from "./auth";
export * from "./blocks";
export * from "./photos";
export * from "./pricing";
export * from "./schedule";
export * from "./venues";

import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  db: z.literal("ok"),
  version: z.string(),
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
