import Link from "next/link";
import {
  ArrowRight, Star, FileText, CheckSquare, BellRing, Quote,
  AlarmClockCheck, ShieldCheck, UserCheck, Network, Blocks, Scale,
  Paperclip, CircleDot,
} from "lucide-react";

export const metadata = {
  title: "Tickler, never miss a lease deadline again",
  description:
    "Tickler reads your lease, remembers the dates hidden inside it, and shows you the exact sentence behind every answer. It uses open-weight models and reminders that survive restarts, and your documents stay on your machine.",
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
    body: "Drop in a PDF. Tickler reads it and shows each important date with the sentence it came from, the page number, and how sure it is.",
  },
  {
    n: "02", icon: CheckSquare, title: "Approve in one pass",
    body: "See something wrong? Fix it in one click. Your corrections are saved, so the answers get better over time.",
  },
  {
    n: "03", icon: BellRing, title: "Never think about it again",
    body: "Reminders arrive 90, 30 and 7 days before each date. They keep working even after a restart. Letters come to you already written, and you decide whether to send them.",
  },
];

function HeroMock() {
  return (
    <div className="heromock" aria-hidden>
      <div className="mockbar">
        <i /><i /><i />
        <span>tickler, lease-04</span>
      </div>
      <div className="mockbody">
        <div className="mockmsg you">what&apos;s coming up on lease-04?</div>
        <div className="mockmsg bot">
          Three deadlines are armed. The term ends <b>June 14, 2028</b>, and the renewal
          notice is due <b>April 15, 2028</b>.
          <span className="mockpill"><Quote size={9} /> renewal_notice · page 2</span>
        </div>
        <div className="mockalert">
          <span className="mockalert-tag">urgent, letter ready</span>
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
          Tickler reads your lease, remembers the important dates hidden inside it, and shows you the exact
          sentence behind every answer. It uses open-weight models, its reminders survive restarts,
          and your documents stay on your machine.
        </p>
        <div className="hero-ctas">
          <Link href="/app" className="cta">Open the app <ArrowRight size={17} /></Link>
          <a className="cta ghostbig" href="https://github.com/abubakar-ahmed-dev/tickler" target="_blank" rel="noreferrer">
            <Star size={17} /> Star on GitHub
          </a>
        </div>
        <div className="trust">
          <span>every answer shows its source</span><i /> <span>reminders that survive restarts</span><i /> <span>you approve every letter</span><i /> <span>it remembers your preferences</span>
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
        <h2>Three Steps, And Then It Runs Itself.</h2>
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
        <h2>Careful With The Details, Because They Matter.</h2>

        <div className="bento">
          <div className="btile wide">
            <div className="bt-copy">
              <Quote size={22} strokeWidth={1.7} className="cardicon" />
              <h3>Citations, not vibes</h3>
              <p>Every answer shows the exact sentence and page from your lease. Tickler checks each quote against the document automatically. If something is not written in the lease, it says so.</p>
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
            <p>Reminders are built on Temporal workflows. In our demo we stop the worker program, and every reminder still arrives on time.</p>
            <div className="bt-diag">
              <span className="kill">worker ✕</span>
              <i />
              <span className="alive">timer fires ✓</span>
            </div>
          </div>

          <div className="btile">
            <ShieldCheck size={22} strokeWidth={1.7} className="cardicon" />
            <h3>Your documents stay yours</h3>
            <p>Tickler uses open-weight models, so your lease never travels to a closed service.</p>
            <span className="bt-mini">no closed services</span>
          </div>

          <div className="btile">
            <UserCheck size={22} strokeWidth={1.7} className="cardicon" />
            <h3>Letters wait for you</h3>
            <p>Letters are written using the sentences from your lease, and they always wait for your approval.</p>
            <div className="bt-letter">
              <span>Draft · renewal notice</span>
              <i>Approve</i><i className="no">Discard</i>
            </div>
          </div>

          <div className="btile">
            <Network size={22} strokeWidth={1.7} className="cardicon" />
            <h3>A memory that compounds</h3>
            <p>Your fixes and preferences are saved in the database. The more you use it, the better it knows your properties.</p>
            <div className="bt-diag soft">
              <span>fix #14 → remembered</span>
            </div>
          </div>
        </div>

        <div className="btile slim">
          <Blocks size={18} strokeWidth={1.7} className="cardicon inline" />
          <h3>MCP-native tools</h3>
          <p>Six tools are available through the Model Context Protocol, so you can connect Tickler to the AI tools you already use.</p>
          <code className="bt-term">npx tickler-mcp <i># six Cypher-backed tools, stdio</i></code>
        </div>
      </section>

      <section className="stats">
        <div className="stat">
          <b>&lt;5s</b>
          <span>to read a lease and list every important date</span>
        </div>
        <div className="stat">
          <b>100%</b>
          <span>of quotes checked against the document automatically</span>
        </div>
        <div className="stat">
          <b>0</b>
          <span>dates the reminder system has ever missed</span>
        </div>
      </section>

      <section className="principle">
        <p className="kicker">The principle</p>
        <blockquote>
          The software must never forget a date.
          The human must make the decisions.
          <span>Tickler keeps both of these promises.</span>
        </blockquote>
      </section>

      <section className="closing">
        <h2>The Reminder Helper That Never Forgets A Date.</h2>
        <Link href="/app" className="cta big">Open the app <ArrowRight size={18} /></Link>
        <p className="closing-note">Free, open source, and your data stays on your machine.</p>
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
            <p>It reads your lease papers, remembers the dates, and shows where each answer came from.</p>
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
          <span>Tickler reads, reminds, and writes drafts. It does not give legal advice. <Scale size={11} style={{ transform: "translateY(2px)" }} /></span>
        </div>
      </footer>
    </div>
  );
}
