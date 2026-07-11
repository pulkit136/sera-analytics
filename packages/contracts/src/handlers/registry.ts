import type { SeraEvent } from "../decoder.js";
import type { NormalizedRecord } from "../normalizer.js";
import { DepositedHandler } from "./deposited.handler.js";
import { InstantWithdrawHandler } from "./instantWithdraw.handler.js";
import { IntentFailedHandler } from "./intentFailed.handler.js";
import { IntentLegMatchedHandler } from "./intentLegMatched.handler.js";
import { IntentMatchedHandler } from "./intentMatched.handler.js";
import { MatchFailedHandler } from "./matchFailed.handler.js";
import { OrderMatchedHandler } from "./orderMatched.handler.js";
import type { EventHandler } from "./types.js";
import { WithdrawHandler } from "./withdraw.handler.js";
import { WithdrawRequestedHandler } from "./withdrawRequested.handler.js";
import { WithdrawnHandler } from "./withdrawn.handler.js";

const handlersMap = new Map<string, EventHandler<SeraEvent>>([
  [DepositedHandler.eventName, DepositedHandler as unknown as EventHandler<SeraEvent>],
  [WithdrawnHandler.eventName, WithdrawnHandler as unknown as EventHandler<SeraEvent>],
  [OrderMatchedHandler.eventName, OrderMatchedHandler as unknown as EventHandler<SeraEvent>],
  [InstantWithdrawHandler.eventName, InstantWithdrawHandler as unknown as EventHandler<SeraEvent>],
  [
    WithdrawRequestedHandler.eventName,
    WithdrawRequestedHandler as unknown as EventHandler<SeraEvent>,
  ],
  [WithdrawHandler.eventName, WithdrawHandler as unknown as EventHandler<SeraEvent>],
  [IntentMatchedHandler.eventName, IntentMatchedHandler as unknown as EventHandler<SeraEvent>],
  [
    IntentLegMatchedHandler.eventName,
    IntentLegMatchedHandler as unknown as EventHandler<SeraEvent>,
  ],
  [MatchFailedHandler.eventName, MatchFailedHandler as unknown as EventHandler<SeraEvent>],
  [IntentFailedHandler.eventName, IntentFailedHandler as unknown as EventHandler<SeraEvent>],
]);

/**
 * Registry of event handlers mapping protocol events to database records.
 */
export const EventHandlerRegistry = {
  /**
   * Dispatches the event to the appropriate handler.
   * Returns empty array for UnknownEvent or unregistered types.
   */
  handle(event: SeraEvent): NormalizedRecord[] {
    if (!event || event.type === "UnknownEvent") {
      return [];
    }

    const handler = handlersMap.get(event.type);
    if (!handler) {
      return [];
    }

    return handler.handle(event);
  },

  /**
   * Dynamically registers or overrides an event handler.
   */
  register(handler: EventHandler<SeraEvent>): void {
    if (!handler || !handler.eventName) {
      throw new Error("Invalid handler structure");
    }
    handlersMap.set(handler.eventName, handler);
  },

  /**
   * Checks if a handler is registered.
   */
  has(eventName: string): boolean {
    return handlersMap.has(eventName);
  },
};
