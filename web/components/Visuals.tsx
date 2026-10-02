import Link from "next/link";
import { site } from "@/lib/site";

/** Splits a line into word-wrapped character spans that rise in one after another. */
export function SplitText({ text, offset = 0 }: { text: string; offset?: number }) {
  let i = offset;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.split(" ").map((word, w) => (
          <span key={w}>
            <span className="word">
              {Array.from(word).map((ch, c) => (
                <span key={c} className="char" style={{ "--i": i++ } as React.CSSProperties}>
                  {ch}
                </span>
              ))}
            </span>{" "}
          </span>
        ))}
      </span>
    </>
  );
}

/** A loose hand-drawn stroke under a word. */
export function Underline({ children }: { children: React.ReactNode }) {
  return (
    <span className="underline">
      {children}
      <svg viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden>
        <path d="M4 16 C 80 4, 160 22, 240 12 S 360 6, 396 14" />
      </svg>
    </span>
  );
}

/** Two drawn phones: the nearby map with the join sheet, and a place chat. */
export function Phones() {
  return (
    <div className="phones" aria-label="The Larea app: a map of chats near you, and a place's chat">
      <div className="phone phone--back">
        <div className="phone__screen">
          <div className="phone__notch" />
          <div className="map">
            <div className="map__radius" />
            <div className="map__me" />
            <span className="map__pin" style={{ left: "58%", top: "26%" }}>
              ☕
            </span>
            <span className="map__pin" style={{ left: "22%", top: "44%" }}>
              📚
            </span>
            <span className="map__pin" style={{ left: "68%", top: "50%" }}>
              🚉
            </span>
            <span className="map__pin" style={{ left: "30%", top: "12%" }}>
              🌳
            </span>
          </div>
          <div className="map__sheet">
            <div className="map__grabber" />
            <div className="map__title">Around you right now</div>
            <div className="map__row">
              <span className="map__icon">📚</span>
              <span className="map__name">
                City Library<small>14 here · 80 m</small>
              </span>
              <span className="map__badge">Nearby</span>
            </div>
            <div className="map__row">
              <span className="map__icon">🚉</span>
              <span className="map__name">
                Central Station<small>63 here · 420 m</small>
              </span>
            </div>
            <div className="map__join">Join chat</div>
          </div>
        </div>
      </div>
      <div className="phone phone--front">
        <div className="phone__screen">
          <div className="phone__notch" />
          <div className="chat">
            <div className="chat__head">
              <b>City Library</b>
              <small>14 people here</small>
            </div>
            <div className="chat__list">
              <div className="msg msg--them" style={{ "--n": 0 } as React.CSSProperties}>
                <div className="msg__who">
                  mara <span className="lvl">Regular</span>
                </div>
                Anyone know if the 3rd floor is open?
              </div>
              <div className="msg msg--me" style={{ "--n": 1 } as React.CSSProperties}>
                Yes, until 10. Quiet zone though 🤫
              </div>
              <div className="msg msg--poll" style={{ "--n": 2 } as React.CSSProperties}>
                <div className="poll__q">Coffee break at 4?</div>
                <div className="poll__bar" style={{ "--w": "72%" } as React.CSSProperties}>
                  <span>Yes</span>
                  <span>72%</span>
                </div>
                <div className="poll__bar" style={{ "--w": "28%" } as React.CSSProperties}>
                  <span>Later</span>
                  <span>28%</span>
                </div>
              </div>
              <div className="msg tipchip" style={{ "--n": 3 } as React.CSSProperties}>
                mara tipped you 2 USDC
              </div>
            </div>
            <div className="chat__composer">Message City Library</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A check-in stamp, as minted to the wallet. */
export function Stamp() {
  const ring = "PROOF OF PRESENCE · LAREA · PROOF OF PRESENCE · LAREA · ";
  return (
    <svg className="stamp" viewBox="0 0 300 300" role="img" aria-label="A Larea check-in stamp: City Library, visit 5">
      <defs>
        <radialGradient id="stamp-bg" cx="35%" cy="30%">
          <stop offset="0" stopColor="#8b74ff" />
          <stop offset="1" stopColor="#3a22b5" />
        </radialGradient>
        <path id="stamp-ring" d="M150,150 m-118,0 a118,118 0 1,1 236,0 a118,118 0 1,1 -236,0" />
      </defs>
      <circle cx="150" cy="150" r="146" fill="url(#stamp-bg)" />
      <circle cx="150" cy="150" r="134" fill="none" stroke="#ffc84a" strokeWidth="2" />
      <circle cx="150" cy="150" r="100" fill="none" stroke="#ffc84a" strokeWidth="1.5" strokeDasharray="6 6" />
      <g className="stamp__ring">
        <text fill="#ffe7a8" fontSize="13" fontWeight="700" letterSpacing="3.2" fontFamily="var(--font-mono-stack)">
          <textPath href="#stamp-ring">{ring}</textPath>
        </text>
      </g>
      <text x="150" y="132" textAnchor="middle" fill="#ffc84a" fontSize="13" fontWeight="700" letterSpacing="4" fontFamily="var(--font-mono-stack)">
        VISIT 5
      </text>
      <text x="150" y="164" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="800" letterSpacing="-1" fontFamily="var(--font-sans-stack)">
        City Library
      </text>
      <text x="150" y="190" textAnchor="middle" fill="#d8d0ff" fontSize="12" fontFamily="var(--font-mono-stack)">
        2026-10-02 · REGULAR
      </text>
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="footer" data-light="on">
      <div className="shell footer__row">
        <span>
          © 2026 {site.name} · Made in Munich
        </span>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
          <Link href="/imprint">Imprint</Link>
        </nav>
      </div>
    </footer>
  );
}
