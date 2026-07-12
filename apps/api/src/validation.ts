/**
 * Validates whether the given string is a valid EVM address format.
 */
export function isValidAddress(address: string | undefined): boolean {
  if (!address) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validates whether the given string is a valid transaction/block hash format.
 */
export function isValidHash(hash: string | undefined): boolean {
  if (!hash) return false;
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Validates whether the given value is a valid non-negative integer.
 */
export function isValidNonNegativeInteger(val: string | undefined): boolean {
  if (!val) return false;
  return /^\d+$/.test(val);
}

/**
 * Validates whether the given value is a valid positive integer.
 */
export function isValidPositiveInteger(val: string | undefined): boolean {
  if (!val) return false;
  return /^[1-9]\d*$/.test(val);
}
