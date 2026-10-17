import Link from "next/link";
import {
  ArrowRight, Star, FileText, CheckSquare, BellRing, Quote,
  AlarmClockCheck, ShieldCheck, UserCheck, Network, Blocks, Scale,
  Paperclip, CircleDot, Terminal,
} from "lucide-react";

export const metadata = {
  title: "Tickler — never miss a lease deadline again",
  description:
    "An agent that reads your lease, remembers the dates hiding in it, and shows the exact sentence behind every answer. Open weights, durable timers, your documents stay yours.",
};

const stack = [
  { name: "FalkorDB", note: "the only datastore" },
  { name: "Temporal", note: "durable timers" },
  { name: "gpt-oss", note: "open weights · Apache-2.0" },
  { name: "Groq", note: "inference" },
  { name: "Next.js", note: "the app" },
];

const steps = [
  {
    n: "01", icon: FileText, title: "Upload a lease",
    body: "Drop in a PDF. Every term is extracted and anchored to the exact sentence it came from — quote, page, and confidence shown.",
  },
  {
    n: "02", icon: CheckSquare, title: "Approve in one pass",
    body: "Anything wrong? Fix it inline. Your corrections are remembered — the agent learns how you run your properties.",
  },
  {
    n: "03", icon: BellRing, title: "Never think about it again",
    body: "Durable reminders fire 90, 30 and 7 days out — and they survive crashes. Letters arrive drafted, waiting for your OK.",
  },
];

function HeroMock() {
  return (
    <div className="heromock" aria-hidden>
      <div className="mockbar">
        <i /><i /><i />
        <span>tickler — lease-04</span>
      </div>
      <div className="mockbody">
        <div className="mockmsg you">what&apos;s coming up on lease-04?</div>
        <div className="mockmsg bot">
          Three deadlines are armed. The term ends <b>June 14, 2028</b> — and the renewal
          notice is due <b>April 15, 2028</b>.
          <span className="mockpill"><Quote size={9} /> renewal_notice · page 2</span>
        </div>
        <div className="mockalert">
          <span className="mockalert-tag">urgent → letter drafted</span>
          <p>Renewal notice for lease-04 is due soon. The letter is ready for your approval.</p>
          <div className="mockalert-btns"><i>Approve letter</i><i>Discard</i></div>
        </div>
      </div>
    </div>
  );
}

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
        <HeroMock />
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
        <div className="timeline">
          <div className="tlline" />
          {steps.map((s, i) => (
            <div className={`tlstep ${i === 2 ? "last" : ""}`} key={s.n}>
              <div className="tldot"><s.icon size={19} strokeWidth={1.8} /></div>
              <span className="tlnum">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section alt" id="why">
        <p className="kicker">Why Tickler</p>
        <h2>Built Like The Paperwork Matters. Because It Does.</h2>

        <div className="bento">
          <div className="btile wide">
            <div className="bt-copy">
              <Quote size={22} strokeWidth={1.7} className="cardicon" />
              <h3>Citations, not vibes</h3>
              <p>Every answer carries the verbatim lease sentence and page it came from — validated against the document in code before it&apos;s allowed to exist. If it isn&apos;t in the lease, Tickler says so.</p>
            </div>
            <div className="bt-visual">
              <span className="bt-chip"><Quote size={9} /> term end · page 1</span>
              <span className="bt-chip alt">deposit return · computed</span>
              <p className="bt-quote">“shall commence on May 1, 2027 and shall continue through October 31, 2027”</p>
            </div>
          </div>

          <div className="btile">
            <AlarmClockCheck size={22} strokeWidth={1.7} className="cardicon" />
            <h3>Timers that survive crashes</h3>
            <p>Reminders are Temporal workflows. We kill the worker on camera — every timer still fires.</p>
            <div className="bt-diag">
              <span className="kill">worker ✕</span>
              <i />
              <span className="alive">timer fires ✓</span>
            </div>
          </div>

          <div className="btile">
            <ShieldCheck size={22} strokeWidth={1.7} className="cardicon" />
            <h3>Your documents stay yours</h3>
            <p>Open-weight models, no closed API in the pipeline.</p>
            <span className="bt-mini">0 closed-API calls</span>
          </div>

          <div className="btile">
            <UserCheck size={22} strokeWidth={1.7} className="cardicon" />
            <h3>Letters wait for you</h3>
            <p>Drafted from the lease&apos;s own sentences — born pending, always.</p>
            <div className="bt-letter">
              <span>Draft · renewal notice</span>
              <i>Approve</i><i className="no">Discard</i>
            </div>
          </div>

          <div className="btile">
            <Network size={22} strokeWidth={1.7} className="cardicon" />
            <h3>A memory that compounds</h3>
            <p>Corrections and preferences live in the graph. It knows your portfolio better every week.</p>
            <div className="bt-diag soft">
              <span>fix #14 → remembered</span>
            </div>
          </div>
        </div>

        <div className="btile slim">
          <Blocks size={18} strokeWidth={1.7} className="cardicon inline" />
          <h3>MCP-native tools</h3>
          <p>Six tools over the Model Context Protocol — plug Tickler&apos;s graph into any MCP client you already run.</p>
          <code className="bt-term">npx tickler-mcp <i># six Cypher-backed tools, stdio</i></code>
        </div>
      </section>

      <section className="stats">
        <div className="stat">
          <b>&lt;5s</b>
          <span>to read a lease and ground every term</span>
        </div>
        <div className="stat">
          <b>100%</b>
          <span>of quotes verified against the document, in code</span>
        </div>
        <div className="stat">
          <b>0</b>
          <span>deadlines forgotten by the machine. Ever.</span>
        </div>
      </section>

      <section className="principle">
        <p className="kicker">The principle</p>
        <blockquote>
          The machine&apos;s job is to never forget a date.
          The human&apos;s job is to decide.
          <span>Tickler keeps both honest.</span>
        </blockquote>
      </section>

      <section className="closing">
        <h2>The Deadline Machine That Can&apos;t Forget.</h2>
        <Link href="/app" className="cta big">Open the app <ArrowRight size={18} /></Link>
        <p className="closing-note">free · open source · your data stays on your machine</p>
      </section>

      <footer className="foot">
        <div className="foot-grid">
          <div className="foot-brand">
            <div className="brand">
              <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden>
                <rect width="64" height="64" rx="14" fill="#1f2830" />
                <path d="M32 12c-8.3 0-14 6.2-14 14v9l-4 7h36l-4-7v-9c0-7.8-5.7-14-14-14z" fill="none" stroke="#4cc38a" strokeWidth="4" strokeLinejoin="round" />
                <path d="M26 46a6 6 0 0 0 12 0" fill="none" stroke="#4cc38a" strokeWidth="4" strokeLinecap="round" />
                <path d="M24 28l6 6 11-11" fill="none" stroke="#e6edf3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Tickler
            </div>
            <p>Your lease&apos;s tickler file.<br />Reads the paperwork. Remembers the dates. Shows its sources.</p>
          </div>
          <div className="foot-col">
            <b>Product</b>
            <a href="/app">Open the app</a>
            <a href="#how">How it works</a>
            <a href="#why">Why Tickler</a>
          </div>
          <div className="foot-col">
            <b>Under the hood</b>
            <a href="https://github.com/abubakar-ahmed-dev/tickler/blob/main/docs/graph-model.md">Graph data model</a>
            <a href="https://github.com/abubakar-ahmed-dev/tickler/blob/main/docs/cypher.md">Cypher queries</a>
            <a href="https://github.com/abubakar-ahmed-dev/tickler">Source (MIT)</a>
          </div>
          <div className="foot-col">
            <b>Built on open</b>
            <span>FalkorDB</span>
            <span>Temporal</span>
            <span>gpt-oss · Apache-2.0</span>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© 2026 Tickler · MIT licensed</span>
          <span>Tickler reads, reminds and drafts — it isn&apos;t legal advice. <Scale size={11} style={{ transform: "translateY(2px)" }} /></span>
        </div>
      </footer>
    </div>
  );
}
