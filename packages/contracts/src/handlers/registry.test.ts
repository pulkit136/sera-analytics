import { describe, expect, it, vi } from "vitest";
import type { SeraEvent } from "../decoder.js";
import type { NormalizedRecord } from "../normalizer.js";
import { EventHandlerRegistry } from "./registry.js";
import type { EventHandler } from "./types.js";

describe("EventHandlerRegistry Unit Tests", () => {
  const baseEventProps = {
    contractAddress: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
    blockNumber: 1000n,
    transactionHash: "0xABCDEF1234567890",
    logIndex: 2,
    topics: ["0x1"],
    data: "0x2",
    blockHash: "0x3",
  };

  it("should have complete coverage of all core protocol events in the registry", () => {
    const expectedEvents = [
      "Deposited",
      "Withdrawn",
      "OrderMatched",
      "InstantWithdraw",
      "WithdrawRequested",
      "Withdraw",
      "IntentMatched",
      "IntentLegMatched",
      "MatchFailed",
      "IntentFailed",
    ];

    for (const name of expectedEvents) {
      expect(EventHandlerRegistry.has(name)).toBe(true);
    }
  });

  it("should return [] gracefully for UnknownEvent", () => {
    const unknownEvent: SeraEvent = {
      type: "UnknownEvent",
      args: {},
      ...baseEventProps,
    };

    const records = EventHandlerRegistry.handle(unknownEvent);
    expect(records).toEqual([]);
  });

  it("should return [] for unregistered/unknown types", () => {
    const randomEvent = {
      type: "UnregisteredRandomEvent",
      args: {},
      ...baseEventProps,
    } as unknown as SeraEvent;

    const records = EventHandlerRegistry.handle(randomEvent);
    expect(records).toEqual([]);
  });

  it("should successfully execute registered handlers and dispatch correctly", () => {
    const event: SeraEvent = {
      type: "Deposited",
      args: {
        token: "0xTOKENADDRESS",
        user: "0xUSERADDRESS",
        amount: 1000n,
      },
      ...baseEventProps,
    };

    const records = EventHandlerRegistry.handle(event);
    expect(records).toHaveLength(1);
    expect(records[0].recordType).toBe("deposit");
  });

  it("should support dynamic registration of new or overriding handlers", () => {
    const customEventName = "CustomUpgradeEvent" as unknown as SeraEvent["type"];

    const mockHandler: EventHandler<SeraEvent> = {
      eventName: customEventName,
      handle: vi
        .fn()
        .mockReturnValue([{ recordType: "custom_record" } as unknown as NormalizedRecord]),
    };

    expect(EventHandlerRegistry.has(customEventName)).toBe(false);

    // Register
    EventHandlerRegistry.register(mockHandler);
    expect(EventHandlerRegistry.has(customEventName)).toBe(true);

    // Dispatch
    const customEvent = {
      type: customEventName,
      args: { test: true },
      ...baseEventProps,
    } as unknown as SeraEvent;

    const records = EventHandlerRegistry.handle(customEvent);
    expect(mockHandler.handle).toHaveBeenCalledWith(customEvent);
    expect(records).toEqual([{ recordType: "custom_record" }]);
  });
});
