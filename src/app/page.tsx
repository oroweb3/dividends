import Link from "next/link";
import OroLogo from "@/components/oro-logo";

export default function Home() {
  return (
    <div className="landing">
      <section className="hero">
        <p className="eyebrow">YOUR STOCKS. YOUR DIVIDENDS. YOUR CHOICE.</p>
        <h1>Make your stock<br />dividends <em>programmable.</em></h1>
        <p className="intro">Keep your stocks.<br />Save your dividends in gold.</p>
        <Link className="button" href="/dashboard">Get started <span aria-hidden>↗</span></Link>
        <p className="small-note">Start with your own Solana Dividend Account.</p>
      </section>
      <section className="concept" aria-label="The Dividends by Oro concept">
        <div className="concept-top"><span className="eyebrow">A NEW DIRECTION FOR DIVIDENDS</span><span>01 / THE IDEA</span></div>
        <div className="flow"><div><span className="asset-icon">↗</span><h2>Your stocks</h2><p>Keep your original exposure</p></div><div className="flow-arrow" aria-label="Dividends flow into gold"><span>DIVIDENDS</span>⟶</div><div><span className="gold-brand" role="img" aria-label="Oro"><OroLogo /></span><h2>Your gold</h2><p>Give your dividends a new home</p></div></div>
        <p className="concept-note">We’re starting with a personal Dividend Account. Stock purchases and dividend routing arrive in the next phases.</p>
      </section>
    </div>
  );
}
