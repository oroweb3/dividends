import type { PrivyClientConfig } from "@privy-io/react-auth";

export const privyConfig = {
  loginMethods: ["email"],
  appearance: {
    theme: "light",
    accentColor: "#00261c",
    walletChainType: "solana-only",
  },
  embeddedWallets: {
    // Create explicitly after login and wallet initialization have settled.
    solana: { createOnLogin: "off" },
    ethereum: { createOnLogin: "off" },
  },
} satisfies PrivyClientConfig;
