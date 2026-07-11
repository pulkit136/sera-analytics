import type { IntentFailedEvent } from "../decoder.js";
import type { NormalizedRecord } from "../normalizer.js";
import type { EventHandler } from "./types.js";

/**
 * Handles IntentFailed events from SeraBatcher.
 */
export const IntentFailedHandler: EventHandler<IntentFailedEvent> = {
  eventName: "IntentFailed",
  handle(event): NormalizedRecord[] {
    // Diagnostic revert log; returns no database record in this model
    return [];
  },
};
