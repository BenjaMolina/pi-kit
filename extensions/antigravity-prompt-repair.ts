import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  ANTIGRAVITY_PROMPT_REPAIR_ENV,
  type AntigravityPromptRepairOptions,
  classifyAntigravityModelSync,
  createAntigravityRequestRepairHandler,
  isAntigravityPromptRepairEnabled,
  sanitizeOpenAICompletionsPayload,
  sanitizePiPromptForAntigravity,
} from "../src/cliproxyapi/pi-antigravity-prompt-repair";

export {
  ANTIGRAVITY_PROMPT_REPAIR_ENV,
  type AntigravityPromptRepairOptions,
  classifyAntigravityModelSync,
  createAntigravityRequestRepairHandler,
  isAntigravityPromptRepairEnabled,
  sanitizeOpenAICompletionsPayload,
  sanitizePiPromptForAntigravity,
};

export default function antigravityPromptRepair(
  pi: ExtensionAPI,
  options?: AntigravityPromptRepairOptions,
) {
  if (typeof pi?.on !== "function") return;
  const handler = createAntigravityRequestRepairHandler(options);
  pi.on("before_provider_request", handler);
}
