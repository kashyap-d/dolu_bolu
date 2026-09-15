import "server-only";

import { z } from "zod";

const supabaseProjectUrlSchema = z.url().refine(
  (value) => {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  },
  {
    message:
      "Use the Supabase project base URL only, without /rest/v1, query parameters, or fragments.",
  },
);

const supabaseEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: supabaseProjectUrlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const aiProviderSchema = z.enum(["demo", "gemini"]);

const geminiEnvironmentSchema = z.object({
  GEMINI_API_KEY: z.string().trim().min(1),
  AI_MODEL: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._-]+$/)
    .optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(15_000),
  AI_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(256)
    .max(4_096)
    .default(1_800),
});

export function isSupabaseConfigured() {
  return supabaseEnvironmentSchema.safeParse(process.env).success;
}

export function getSupabaseEnvironment() {
  const parsed = supabaseEnvironmentSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local.",
    );
  }

  return parsed.data;
}

export function getAiProviderName() {
  const parsed = aiProviderSchema.safeParse(process.env.AI_PROVIDER ?? "demo");

  if (!parsed.success) {
    throw new Error("AI_PROVIDER must be either demo or gemini.");
  }

  return parsed.data;
}

export function getGeminiEnvironment() {
  const parsed = geminiEnvironmentSchema.safeParse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    AI_MODEL: process.env.AI_MODEL || undefined,
    AI_TIMEOUT_MS: process.env.AI_TIMEOUT_MS,
    AI_MAX_OUTPUT_TOKENS: process.env.AI_MAX_OUTPUT_TOKENS,
  });

  if (!parsed.success) {
    throw new Error(
      "Gemini is not configured. Add a server-only GEMINI_API_KEY and valid AI settings to .env.local.",
    );
  }

  return {
    apiKey: parsed.data.GEMINI_API_KEY,
    model: parsed.data.AI_MODEL ?? "gemini-3.5-flash-lite",
    timeoutMs: parsed.data.AI_TIMEOUT_MS,
    maxOutputTokens: parsed.data.AI_MAX_OUTPUT_TOKENS,
  };
}
