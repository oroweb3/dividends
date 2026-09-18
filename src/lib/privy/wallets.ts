import type { User } from "@privy-io/react-auth";

// Use linked identity, not the first connected wallet (which may be external).
export function getDividendWallet(user: User | null) {
  return user?.linkedAccounts.find(
    (account) =>
      account.type === "wallet" &&
      account.chainType === "solana" &&
      account.walletClientType === "privy" &&
      (account.walletIndex === undefined || account.walletIndex === 0),
  );
}
