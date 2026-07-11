import type { TokenDiscoveryRegistry, TokenDiscoveryRule } from "./interfaces.js";

/**
 * Default registry implementation mapping Layer 1 record types to discovery rules.
 *
 * Implements the Open/Closed Principle: new rules can be added dynamically at runtime
 * without modifying the registry or execution engine source code.
 */
export class DefaultTokenDiscoveryRegistry implements TokenDiscoveryRegistry {
  private readonly rulesMap = new Map<string, TokenDiscoveryRule[]>();

  /**
   * Registers a protocol discovery rule.
   */
  public register(rule: TokenDiscoveryRule): void {
    const list = this.rulesMap.get(rule.recordType) || [];
    list.push(rule);
    this.rulesMap.set(rule.recordType, list);
  }

  /**
   * Retrieves all rules registered for a given record type.
   */
  public getRulesFor(recordType: string): readonly TokenDiscoveryRule[] {
    return this.rulesMap.get(recordType) || [];
  }
}
