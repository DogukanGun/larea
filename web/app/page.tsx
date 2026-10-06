import Link from "next/link";
import { Band, Closing, Rail, RevealObserver } from "@/components/Motion";
import { TopBar } from "@/components/TopBar";
import { Footer, Phones, SplitText, Stamp, Underline } from "@/components/Visuals";
import { site } from "@/lib/site";

const sections = [
  { id: "intro", label: "Intro" },
  { id: "how", label: "How it works" },
  { id: "solana", label: "Solana" },
  { id: "safety", label: "Safety" },
  { id: "get", label: "Get Larea" },
];

const places = ["Libraries", "Stations", "Squares", "Universities", "Stadiums", "Museums", "Parks", "Cafés", "Malls", "Theatres"];

const steps = [
  {
    glyph: "📍",
    name: "Be there.",
    body: "Every chat belongs to a real place on the map, from OpenStreetMap. Get within 200 metres and the join button lights up. Walk away and you leave the chat on your own.",
    tags: ["200 m radius", "GPS check", "No spoofing"],
  },
  {
    glyph: "🪪",
    name: "Grown-ups only.",
    body: "Your phone's own age signal confirms you're 18 or older: Apple's Declared Age Range or Google Play Age Signals. No ID upload, and no birthday stored. Larea keeps pass or fail, nothing else.",
    tags: ["18+", "No ID scans", "Pass / fail only"],
  },
  {
    glyph: "🛡️",
    name: "Talk, safely.",
    body: "Every message, photo and poll is checked before anyone sees it. Slurs get masked, threats never land, and repeat offenders get muted. Report or block anyone in two taps.",
    tags: ["AI moderation", "Report & block", "Strikes"],
  },
  {
    glyph: "🤝",
    name: "Trade nearby.",
    body: "Sell something or ask for a hand within 2 km. Deals are paid inside the app, and the money is released with a six-digit handover code when you meet.",
    tags: ["2 km market", "Handover code", "Help requests"],
  },
];

const solana = [
  { icon: "🎟️", title: "Check-in stamps", body: "Checking in mints a compressed NFT stamp to your wallet: proof you were there. It's soulbound, and you get one per place per day." },
  { icon: "🔓", title: "Stamps open the chat", body: "In the Solana build, your stamp from the last 24 hours is your key to that place's chat." },
  { icon: "🏅", title: "Loyalty you own", body: "Visitor, Regular, Local, Legend. Each level is a badge minted to your wallet and shown next to your name." },
  { icon: "🛋️", title: "The Regulars room", body: "Every place gets a second room for the people who keep coming back, and Regulars can start polls." },
  { icon: "💸", title: "Tips in USDC & SKR", body: "Long-press a message to tip someone. It goes wallet to wallet, and the chat says thanks." },
  { icon: "🎁", title: "Perks & SKR drops", body: "Places reward their regulars with perks and SKR drops. Reaching a level pays SKR, too." },
];

const rules = [
  ["Your exact location is never shown.", "Others see that you're here, never where. Listings show a rough area of about 150 m, not your door."],
  ["Chats forget.", "Messages and photos are deleted after 7 days. Reported ones are kept for 90 days for safety review, then deleted too."],
  ["No ID scans, no birthdays.", "The age check uses your phone's own signal. We store pass or fail and which platform answered."],
  ["Checked before it's seen.", "Moderation runs before a message reaches anyone, not after the damage is done."],
  ["No ads. No trackers.", "The apps contain no advertising or analytics SDKs, and we don't sell or share your data for marketing."],
  ["Stored in Germany.", "Accounts, chats and photos are stored on our own server in Nuremberg. To moderate them, text and photos are checked by OpenAI, which doesn't train on them."],
];

function StoreCard({ label, name, href, cta = "Get it →" }: { label: string; name: string; href: string | null; cta?: string }) {
  const inner = (
    <>
      <small>{label}</small>
      <b>{name}</b>
      <em>{href ? cta : "Coming soon"}</em>
    </>
  );
  if (href?.startsWith("/")) {
    return (
      <Link className="store" href={href}>
        {inner}
      </Link>
    );
  }
  return href ? (
    <a className="store" href={href} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <div className="store" aria-disabled="true">
      {inner}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <div className="grain" aria-hidden />
      <TopBar />
      <Rail sections={sections} />
      <RevealObserver />

      <main>
        <section className="hero" id="intro" data-section="Intro">
          <div className="hero__aurora" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <div className="shell hero__grid">
            <div className="hero__copy">
              <p className="eyebrow">Location-based group chat · 18+</p>
              <h1 className="h1">
                <SplitText text="Talk to the people" />
                <span className="accent">
                  <Underline>
                    <SplitText text="right here." offset={18} />
                  </Underline>
                </span>
              </h1>
              <p className="body">
                Larea opens a group chat for every real place: the library, the station, the square, the stadium. You can join
                when you’re within 200 metres, and you’re out when you leave.
              </p>
              <div className="hero__actions">
                <Link className="btn btn--primary" href="#get">
                  Get the app
                </Link>
                <Link className="btn btn--ghost" href="#how">
                  How it works
                </Link>
              </div>
              <ul className="hero__facts">
                <li>200 m radius</li>
                <li>18+ verified</li>
                <li>Moderated</li>
                <li>No ads</li>
              </ul>
            </div>
            <div className="hero__phones">
              <Phones />
            </div>
          </div>
        </section>

        <div className="marquee" aria-label="Places with a Larea chat">
          <div className="marquee__track">
            {[...places, ...places].map((p, i) => (
              <span key={i} className="marquee__item" aria-hidden={i >= places.length}>
                {p}
              </span>
            ))}
          </div>
        </div>

        <Band
          head={
            <div className="shell">
              <p className="eyebrow">How it works</p>
              <h2 className="h2 h2--compact">
                Four rules make a chat feel like a <span className="accent">place.</span>
              </h2>
            </div>
          }
        >
          {steps.map((s, i) => (
            <li key={s.name} className="panel">
              <div className="panel__top">
                <span className="panel__num">0{i + 1} / 0{steps.length}</span>
                <span className="panel__glyph" aria-hidden>
                  {s.glyph}
                </span>
              </div>
              <h3 className="panel__name">{s.name}</h3>
              <p className="body">{s.body}</p>
              <ul className="tags">
                {s.tags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </li>
          ))}
        </Band>

        <section className="section solana" id="solana" data-section="Solana">
          <div className="shell">
            <div className="solana__head">
              <div className="reveal">
                <p className="eyebrow eyebrow--sunny">Neighborhood · Solana Mobile</p>
                <h2 className="h2">
                  Being there,{" "}
                  <Underline>
                    <span className="accent">made ownable.</span>
                  </Underline>
                </h2>
                <p className="body">
                  In the Larea app for the Solana dApp Store, presence becomes proof. You check in where you are, collect stamps
                  you own, become a regular, and pay people in the chat, all from your own wallet on your Seeker or any Android
                  phone with a Solana wallet.
                </p>
                <p className="note">Live on Solana devnet · mainnet after review</p>
                <div className="hero__actions" style={{ marginTop: 24 }}>
                  <Link className="btn btn--primary" href="/try">
                    Try the APK
                  </Link>
                  <a className="btn btn--ghost" href={site.repo} target="_blank" rel="noreferrer">
                    Source on GitHub
                  </a>
                </div>
              </div>
              <div className="reveal" style={{ "--d": 2 } as React.CSSProperties}>
                <Stamp />
              </div>
            </div>
            <div className="features">
              {solana.map((f, i) => (
                <article key={f.title} className="feature reveal" style={{ "--d": i % 3 } as React.CSSProperties}>
                  <div className="feature__icon" aria-hidden>
                    {f.icon}
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              ))}
              <article className="feature reveal" style={{ "--d": 0 } as React.CSSProperties}>
                <div className="feature__icon" aria-hidden>
                  🏪
                </div>
                <h3>Market in USDC</h3>
                <p>Listings from the Solana app are priced in USDC. The buyer pays from their wallet, and the seller is paid out on the handover code.</p>
              </article>
              <article className="feature reveal" style={{ "--d": 1 } as React.CSSProperties}>
                <div className="feature__icon" aria-hidden>
                  🔐
                </div>
                <h3>Your keys, your wallet</h3>
                <p>Larea never holds your keys. Every transaction is built by Larea and signed by your wallet through Mobile Wallet Adapter.</p>
              </article>
              <article className="feature reveal" style={{ "--d": 2 } as React.CSSProperties}>
                <div className="feature__icon" aria-hidden>
                  🌍
                </div>
                <h3>Same chats, everyone</h3>
                <p>Solana users and everyone on iOS or Google Play share the same place chats. The crypto parts are opt-in.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="safety" data-section="Safety">
          <div className="shell">
            <div className="reveal rules-head">
              <p className="eyebrow">Safety & privacy</p>
              <h2 className="h2">
                Rules we hold <Underline>ourselves</Underline> to.
              </h2>
            </div>
            <ol className="rules">
              {rules.map(([title, text], i) => (
                <li key={title} className="rules__row reveal" style={{ "--d": i % 3 } as React.CSSProperties}>
                  <span>0{i + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <Closing
          teaser={
            <>
              <p className="eyebrow" style={{ justifyContent: "center" }}>
                Keep scrolling
              </p>
              <h2 className="h2">
                Your city is <span className="accent">already talking.</span>
              </h2>
            </>
          }
        >
          <div className="closing__inner">
            <p className="eyebrow" style={{ justifyContent: "center", color: "var(--violet)" }}>
              Get Larea
            </p>
            <h2 className="closing__title">Join the chat at the place you’re standing in.</h2>
            <p className="body">
              Larea is in beta. Pick your store, or write to us to join the test group.
            </p>
            <div className="stores">
              <StoreCard label="iPhone" name="App Store" href={site.links.ios} />
              <StoreCard label="Android" name="Google Play" href={site.links.android} />
              <StoreCard
                label="Solana Mobile"
                name={site.links.solanaDappStore ? "dApp Store" : "Android APK"}
                href={site.links.solanaDappStore ?? "/try"}
                cta={site.links.solanaDappStore ? "Get it →" : "Download →"}
              />
            </div>
            <a className="closing__mail" href={`mailto:${site.email}?subject=Larea%20beta`}>
              Join the beta: {site.email}
            </a>
          </div>
        </Closing>
      </main>
      <Footer />
    </>
  );
}
