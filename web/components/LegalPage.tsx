import { TopBar } from "@/components/TopBar";
import { Footer } from "@/components/Visuals";

/** Light reading layout shared by privacy, terms, support and imprint. */
export function LegalPage({
  eyebrow,
  title,
  intro,
  toc,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: React.ReactNode;
  toc?: { id: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <>
      <TopBar light />
      <main className="page">
        <header className="page__head">
          <div className="shell">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            {intro ? <p>{intro}</p> : null}
            {toc ? (
              <nav className="toc" aria-label="On this page">
                {toc.map((t) => (
                  <a key={t.id} href={`#${t.id}`}>
                    {t.label}
                  </a>
                ))}
              </nav>
            ) : null}
          </div>
        </header>
        <div className="shell">
          <article className="prose">{children}</article>
        </div>
      </main>
      <Footer />
    </>
  );
}
