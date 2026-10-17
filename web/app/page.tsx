import Link from "next/link";
import {
  ArrowRight, Star, FileText, CheckSquare, BellRing, Quote,
  AlarmClockCheck, ShieldCheck, UserCheck, Network, Blocks, Scale,
} from "lucide-react";

export const metadata = {
  title: "Tickler — never miss a lease deadline again",
  description:
    "An agent that reads your lease, remembers the dates hiding in it, and shows the exact sentence behind every answer. Open weights, durable timers, your documents stay yours.",
};

const steps = [
  {
    icon: FileText,
    title: "Upload a lease",
    body: "Drop in a PDF. Every term is extracted and anchored to the exact sentence it came from — you see the quote, the page, and how sure the model is.",
  },
  {
    icon: CheckSquare,
    title: "Approve in one pass",
    body: "Anything wrong? Edit it inline. Your fixes are remembered — the agent learns how you run your properties, session after session.",
  },
  {
    icon: BellRing,
    title: "Never think about it again",
    body: "Durable reminders fire 90, 30 and 7 days out — and they survive crashes. Notice letters arrive drafted, waiting for your OK.",
  },
];

const features = [
  { icon: Quote, title: "Citations, not vibes", body: "Every answer carries the verbatim lease sentence and page it came from. If it isn't in the lease, Tickler says so." },
  { icon: AlarmClockCheck, title: "Timers that survive crashes", body: "Reminders are Temporal workflows. Kill the process, pull the power — the deadline is still remembered. Proven on camera." },
  { icon: ShieldCheck, title: "Your documents stay yours", body: "Open-weight models, no closed API in the pipeline. Site photos and rate sheets never leave your machine's stack." },
  { icon: UserCheck, title: "Letters wait for you", body: "The agent drafts notice letters grounded only in the lease's own sentences — and no letter is ever sent without your approval." },
  { icon: Network, title: "A memory that compounds", body: "Corrections, preferences and history live in the graph. The longer you use it, the better it knows your portfolio." },
  { icon: Blocks, title: "MCP-native tools", body: "Six tools, exposed over the Model Context Protocol — plug Tickler's graph into any MCP client you already run." },
];

const stack = [
  { name: "FalkorDB", note: "the only datastore" },
  { name: "Temporal", note: "durable timers" },
  { name: "gpt-oss", note: "open weights, Apache-2.0" },
  { name: "Groq", note: "inference" },
  { name: "Next.js", note: "the app" },
];

export default function Landing() {
  return (
    <div className="land">
      <header className="nav">
        <div className="nav-inner">
          <Link href="/" className="brand">
            <svg viewBox="0 0 64 64" width="26" height="26" aria-hidden>
              <rect width="64" height="64" rx="14" fill="#1f2830" />
              <path d="M32 12c-8.3 0-14 6.2-14 14v9l-4 7h36l-4-7v-9c0-7.8-5.7-14-14-14z" fill="none" stroke="#4cc38a" strokeWidth="4" strokeLinejoin="round" />
              <path d="M26 46a6 6 0 0 0 12 0" fill="none" stroke="#4cc38a" strokeWidth="4" strokeLinecap="round" />
              <path d="M24 28l6 6 11-11" fill="none" stroke="#e6edf3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Tickler
          </Link>
          <nav className="navlinks">
            <a href="#how">How it works</a>
            <a href="#why">Why Tickler</a>
            <a href="#open">Built on open</a>
            <a href="https://github.com/abubakar-ahmed-dev/tickler" target="_blank" rel="noreferrer">GitHub</a>
          </nav>
          <Link href="/app" className="cta small">Open the app <ArrowRight size={15} /></Link>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">Open-source AI for small landlords</p>
        <h1>
          Never Miss A<br />Lease Deadline <span className="glow">Again.</span>
        </h1>
        <p className="sub">
          Tickler reads your lease, remembers the dates hiding inside it, and shows you the exact
          sentence behind every answer. Open-weight models. Timers that can&apos;t forget.
          Your documents stay yours.
        </p>
        <div className="hero-ctas">
          <Link href="/app" className="cta">Open the app <ArrowRight size={17} /></Link>
          <a className="cta ghostbig" href="https://github.com/abubakar-ahmed-dev/tickler" target="_blank" rel="noreferrer">
            <Star size={17} /> Star on GitHub
          </a>
        </div>
        <div className="trust">
          <span>grounded answers</span><i /> <span>kill-proof timers</span><i /> <span>human-approved letters</span><i /> <span>graph memory</span>
        </div>
      </section>

      <section className="strip" id="open">
        <div className="strip-inner">
          {stack.map(s => (
            <div className="stackcard" key={s.name}>
              <b>{s.name}</b><span>{s.note}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="how">
        <p className="kicker">How it works</p>
        <h2>Three Steps. Then It Never Sleeps.</h2>
        <div className="cards3">
          {steps.map((s, i) => (
            <div className="card" key={s.title}>
              <div className="cardnum">0{i + 1}</div>
              <s.icon size={30} strokeWidth={1.7} className="cardicon" />
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section alt" id="why">
        <p className="kicker">Why Tickler</p>
        <h2>Built Like The Paperwork Matters. Because It Does.</h2>
        <div className="cards3">
          {features.map(f => (
            <div className="card flat" key={f.title}>
              <f.icon size={26} strokeWidth={1.7} className="cardicon" />
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
        <div className="legalnote">
          <Scale size={16} /> Tickler reads, reminds and drafts. It isn&apos;t legal advice — you stay the decider.
        </div>
      </section>

      <section className="closing">
        <h2>The Deadline Machine That Can&apos;t Forget.</h2>
        <Link href="/app" className="cta big">Open the app <ArrowRight size={18} /></Link>
      </section>

      <footer className="foot">
        <span>Tickler — open source, MIT.</span>
        <span>Built with FalkorDB, Temporal, and open-weight models.</span>
        <a href="https://github.com/abubakar-ahmed-dev/tickler">GitHub</a>
      </footer>
    </div>
  );
}
