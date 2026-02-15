import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { intentSchema, type IntentResult } from "./schemas";
import { buildSystemPrompt } from "./prompt";
import type { StoreContext } from "../context";

/**
 * Extract a structured intent from a user message using Claude.
 * Returns a validated IntentResult matching the AGENTS.md contract.
 */
export async function extractIntent(
  message: string,
  context: StoreContext,
): Promise<IntentResult> {
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    schema: intentSchema,
    system: buildSystemPrompt(context),
    prompt: message,
  });

  return object;
}
