"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { privyConfig } from "@/lib/privy/config";

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();

export function Providers({ children }: { children: React.ReactNode }) {
  if (!privyAppId) return children;
  return (
    <PrivyProvider
      appId={privyAppId}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID?.trim() || undefined}
      config={privyConfig}
    >
      {children}
    </PrivyProvider>
  );
}
