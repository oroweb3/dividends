"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="dashboard">
      <p className="eyebrow">SOMETHING WENT WRONG</p>
      <h1>Let’s try that again.</h1>
      <div className="panel">
        <p>The account screen could not load. Try again, or check your Privy app configuration if the issue continues.</p>
        <button className="button" onClick={reset}>Try again</button>
      </div>
    </section>
  );
}
