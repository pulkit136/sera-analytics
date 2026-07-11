import type { IntentLegMatchedEvent } from "../decoder.js";
import type { NormalizedRecord } from "../normalizer.js";
import type { EventHandler } from "./types.js";

/**
 * Handles IntentLegMatched route hop events from SeraSOR.
 */
export const IntentLegMatchedHandler: EventHandler<IntentLegMatchedEvent> = {
  eventName: "IntentLegMatched",
  handle(event): NormalizedRecord[] {
    // Diagnostic log hop; returns no database fact in this model
    return [];
  },
};
