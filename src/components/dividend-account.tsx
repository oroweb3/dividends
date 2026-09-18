"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useCreateWallet, useWallets } from "@privy-io/react-auth/solana";
import { privyAppId } from "./providers";
import { DelegationControl } from "./delegation-control";
import { StocksPanel } from "./stocks-panel";
import { getDividendWallet } from "@/lib/privy/wallets";

export function DividendAccount() {
  if (!privyAppId) {
    return <section className="dashboard"><p className="eyebrow">LET’S GET YOU SET UP</p><h1>Your Dividend Account</h1><div className="panel"><span className="tag">Configuration needed</span><h2>Connect Dividends by Oro to Privy</h2><p>Add <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to <code>.env.local</code> and restart the app to enable sign-in.</p><p className="muted">Use a dedicated Dividends by Oro app in the Privy dashboard, enable email login and Solana embedded wallets, and allow your local app origin.</p></div></section>;
  }
  return <AuthenticatedAccount />;
}

function AuthenticatedAccount() {
  const { ready, authenticated, user, logout } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const creatingRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const { login } = useLogin({ onError: () => setError("Sign-in could not be completed. Please try again.") });
  const wallet = getDividendWallet(user);
  const address = wallet?.type === "wallet" ? wallet.address : undefined;

  async function handleCreate() {
    if (!ready || !authenticated || !walletsReady || address || creatingRef.current) return;
    creatingRef.current = true;
    setError(null);
    setCreating(true);
    try { await createWallet(); }
    catch { setError("We couldn’t finish creating your account. Please try again. If this continues, refresh the page or contact support."); }
    finally { creatingRef.current = false; setCreating(false); }
  }

  async function handleLogout() {
    setError(null);
    setBusy(true);
    try { await logout(); setCopied(false); }
    catch { setError("Sign-out failed. Please try again."); }
    finally { setBusy(false); }
  }

  async function copyAddress() {
    if (!address) return;
    try { await navigator.clipboard.writeText(address); setCopied(true); }
    catch { setError("Couldn’t copy automatically. Select and copy the wallet address below."); }
  }

  if (!ready) return <section className="dashboard"><SetupWait message="Loading your account…" /></section>;
  if (!authenticated) return (
    <section className="dashboard"><p className="eyebrow">A LITTLE SETUP. A NEW POSSIBILITY.</p><h1>Your Dividend Account</h1><div className="panel"><h2>Start with an account that’s yours.</h2><p>Sign in with your email. Then create your personal Solana Dividend Account in one step.</p><button className="button" onClick={() => { setError(null); login(); }}>Sign in with email <span aria-hidden>↗</span></button>{error && <p className="error" role="alert">{error}</p>}<p className="muted">Your wallet belongs to you. Automatic dividend conversions are not enabled in this preview.</p></div></section>
  );

  return (
    <section className="dashboard">
      <div className="dashboard-heading"><div><p className="eyebrow">YOUR DIVIDENDS ACCOUNT</p><h1>A golden beginning.</h1></div><button className="text-button" disabled={busy || creating} onClick={handleLogout}>Sign out</button></div>
      <div className="panel wallet-panel"><div className="panel-heading"><span className="tag">{address ? "Account created" : "Account setup"}</span></div><h2>Dividend Account</h2><p>Your personal, user-owned Solana wallet.</p>
        {address ? <div className="address-block"><label htmlFor="wallet-address">SOLANA WALLET ADDRESS</label><div className="address-row"><input id="wallet-address" readOnly value={address} /><button className="text-button" onClick={copyAddress}>{copied ? "Copied ✓" : "Copy address"}</button></div><p className="small-note" aria-live="polite">{copied ? "Wallet address copied to clipboard." : "This is your dedicated Dividend Account address."}</p></div> : !walletsReady ? <SetupWait message="Preparing your Dividend Account…" /> : <div><p>Create your personal Solana wallet to finish setting up your Dividend Account.</p><button className="button" disabled={busy || creating} onClick={handleCreate}>{creating ? "Creating account…" : "Create Dividend Account"}</button>{creating && <SetupWait message="Setting up your account…" />}</div>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      {address && <DelegationControl key={`delegation:${address}`} wallet={address} />}
      {address && <StocksPanel key={address} wallet={address} />}
      <div className="next-step"><span className="step-number">NEXT UP</span><div><h2>Keep your stocks. Save in gold.</h2><p>Enable tracking before a future dividend. Conversion requires verified eligibility and active automation permission.</p></div></div>
    </section>
  );
}

// A delayed request is not a failed request. Keep creation locked while pending;
// refresh reconciles the linked wallet before allowing another attempt.
function SetupWait({ message }: { message: string }) {
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDelayed(true), 20000);
    return () => window.clearTimeout(timer);
  }, []);

  return delayed ? (
    <div role="status">
      <p>This is taking longer than expected. Refresh to check whether your account is ready.</p>
      <button className="text-button" onClick={() => window.location.reload()}>Refresh account</button>
    </div>
  ) : <p role="status">{message}</p>;
}
