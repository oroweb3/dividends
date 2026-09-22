import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import OroLogo from "@/components/oro-logo";
import { Providers } from "@/components/providers";
import "./globals.css";

const serif = localFont({ src: "./fonts/OrticaLinear-Regular.otf", variable: "--font-domaine", weight: "400", display: "swap" });
const sans = localFont({ src: "./fonts/InstrumentSans.ttf", variable: "--font-sans", weight: "400 700", display: "swap" });

const title = "Dividends by Oro — Your dividends. In gold.";
const description = "Track your xStocks and turn eligible future dividends into Oro GOLD. Your stocks stay yours.";
export const metadata: Metadata = {
  metadataBase: new URL("https://dividends.oro.finance"),
  applicationName: "Dividends by Oro",
  title,
  description,
  openGraph: { title, description, siteName: "Dividends by Oro", type: "website" },
  twitter: { card: "summary", title, description },
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
          <footer><span>Your dividends. In gold.</span><span>Dividends by Oro · Tracking preview</span></footer>
        </Providers>
      </body>
    </html>
  );
}
