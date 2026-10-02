"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Fixed header: transparent over the hero, frosted once scrolled, light over light sections. */
export function TopBar({ light = false }: { light?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [overLight, setOverLight] = useState(false);

  useEffect(() => {
    const update = () => {
      setScrolled(window.scrollY > 24);
      // A section marks itself data-light="on" while its light surface sits under the bar.
      const lights = document.querySelectorAll<HTMLElement>('[data-light="on"]');
      setOverLight(
        Array.from(lights).some((el) => {
          const r = el.getBoundingClientRect();
          return r.top <= 60 && r.bottom >= 60;
        }),
      );
    };
    // Measure after other scroll handlers have run (the closing section flips its flag in a frame callback).
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => requestAnimationFrame(update));
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("larea:light", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("larea:light", schedule);
    };
  }, []);

  const classes = ["top", scrolled && "is-scrolled", (light || overLight) && "is-light"].filter(Boolean).join(" ");
  return (
    <header className={classes}>
      <Link href="/" className="top__brand" aria-label="Larea home">
        <Image src="/larea-icon.png" alt="" width={32} height={32} priority />
        Larea
      </Link>
      <nav className="top__nav" aria-label="Main">
        <Link className="top__link" href="/#how">
          How it works
        </Link>
        <Link className="top__link" href="/#solana">
          Solana
        </Link>
        <Link className="top__link" href="/#safety">
          Safety
        </Link>
        <Link className="top__cta" href="/#get">
          Get Larea
        </Link>
      </nav>
    </header>
  );
}
