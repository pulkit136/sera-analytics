import type { MatchFailedEvent } from "../decoder.js";
import type { NormalizedRecord } from "../normalizer.js";
import type { EventHandler } from "./types.js";

/**
 * Handles MatchFailed events from SeraBatcher.
 */
export const MatchFailedHandler: EventHandler<MatchFailedEvent> = {
  eventName: "MatchFailed",
  handle(event): NormalizedRecord[] {
    // Diagnostic revert log; returns no database record in this model
    return [];
  },
};
