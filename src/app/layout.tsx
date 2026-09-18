import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import OroLogo from "@/components/oro-logo";
import { Providers } from "@/components/providers";
import "./globals.css";

const serif = localFont({ src: "./fonts/OrticaLinear-Regular.otf", variable: "--font-domaine", weight: "400", display: "swap" });
const sans = localFont({ src: "./fonts/InstrumentSans.ttf", variable: "--font-sans", weight: "400 700", display: "swap" });

export const metadata: Metadata = {
  title: "Dividends by Oro — Keep your stocks. Save in gold.",
  description: "Make your stock dividends programmable. Keep your stocks. Save your dividends in gold.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <Providers>
          <header className="header">
            <Link href="/" className="brand" aria-label="Dividends by Oro home"><span className="brand-name">Dividends</span><span className="brand-endorsement">by <OroLogo className="oro-logo" /></span></Link>
            <span className="network"><span /> Built on Solana</span>
          </header>
          <main>{children}</main>
          <footer><span>Stock ownership. A golden perspective.</span><span>Dividends by Oro · Phase 2 preview</span></footer>
        </Providers>
      </body>
    </html>
  );
}
