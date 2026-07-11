export const CONTRACT_ADDRESSES = {
  VAULT: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43" as const,
  SERA: "0xB5C50C5D5f038404F85970b7f5B7259C4AC0E198" as const,
  SERA_SOR: "0xa7A0cf7cd6f043fCA23f29d8ae5aae6b46e11c18" as const,
  SERA_BATCHER: "0x1f4b366f4145A92978df4bEeb6BdE71bC652F034" as const,
} as const;

export type ContractName = keyof typeof CONTRACT_ADDRESSES;
export type ContractAddress = (typeof CONTRACT_ADDRESSES)[ContractName];
