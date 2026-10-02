"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Adds .is-in to every .reveal element (and [data-reveal] containers) once it scrolls into view. */
export function RevealObserver() {
  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>(".reveal, [data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);
  return null;
}

/** Calls `onProgress(p)` with how far `el` has travelled through its sticky range (0…1). */
function useScrollProgress(ref: React.RefObject<HTMLElement | null>, onProgress: (p: number, el: HTMLElement) => void) {
  const cb = useRef(onProgress);
  useEffect(() => {
    cb.current = onProgress;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const tick = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const range = r.height - window.innerHeight;
      const p = range > 0 ? Math.min(1, Math.max(0, -r.top / range)) : 0;
      cb.current(p, el);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref]);
}

/**
 * A horizontal track pinned while the page scrolls past it: the section is as tall as the
 * track is wide, and vertical scroll moves the panels sideways. Plain stacking on small screens.
 */
export function Band({ head, children }: { head: ReactNode; children: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLOListElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => {
      const t = track.current;
      if (!t) return;
      const pinned = window.matchMedia("(min-width: 861px) and (prefers-reduced-motion: no-preference)").matches;
      const overflow = t.scrollWidth - window.innerWidth;
      setHeight(pinned && overflow > 0 ? window.innerHeight + overflow : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useScrollProgress(section, (p, el) => {
    const t = track.current;
    if (!t) return;
    const overflow = Math.max(0, t.scrollWidth - window.innerWidth);
    el.style.setProperty("--band-x", String(p * overflow));
    el.style.setProperty("--band-p", String(p));
  });

  return (
    <section ref={section} id="how" className="band" style={height ? { height } : undefined} data-section="How it works">
      <div className="band__pin">
        {head}
        <ol ref={track} className="band__track">
          {children}
        </ol>
        <div className="shell band__progress" aria-hidden>
          <div className="band__bar">
            <span />
          </div>
        </div>
      </div>
    </section>
  );
}

/** The closing stage: an orb on the dark page, then a light card wipes up over it. */
export function Closing({ teaser, children }: { teaser: ReactNode; children: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  useScrollProgress(section, (p, el) => {
    // Ease the wipe so it finishes before the end of the sticky range.
    const eased = Math.min(1, Math.max(0, (p - 0.15) / 0.6));
    el.style.setProperty("--close-p", String(eased));
    const light = eased > 0.92 ? "on" : "off";
    if (card.current && card.current.dataset.light !== light) {
      card.current.dataset.light = light;
      window.dispatchEvent(new Event("larea:light"));
    }
  });
  return (
    <section ref={section} id="get" className="closing" data-section="Get Larea">
      <div className="closing__pin">
        <div className="closing__orb" aria-hidden />
        <div className="closing__teaser">{teaser}</div>
        <div ref={card} className="closing__card" data-light="off">
          {children}
        </div>
      </div>
    </section>
  );
}

/** Right-edge rail: one tick per section, the one in view is highlighted. */
export function Rail({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el !== null);
    const update = () => {
      const mid = window.innerHeight * 0.45;
      const current = els.find((el) => {
        const r = el.getBoundingClientRect();
        return r.top <= mid && r.bottom >= mid;
      });
      setActive(current?.id ?? null);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [sections]);

  return (
    <nav className="rail" aria-label="Sections">
      <ol>
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className={`rail__btn${active === s.id ? " is-on" : ""}`}>
              <span className="rail__label">{s.label}</span>
              <span className="rail__tick" />
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
