import type { SeraEvent } from "../decoder.js";
import type { NormalizedRecord } from "../normalizer.js";

/**
 * Interface representing a protocol event handler.
 */
export interface EventHandler<T extends SeraEvent = SeraEvent> {
  /** The specific protocol event name this handler processes. */
  readonly eventName: T["type"];
  /**
   * Translates the decoded event into database-ready normalized records.
   *
   * @param event Decoded event matching eventName.
   */
  handle(event: T): NormalizedRecord[];
}
