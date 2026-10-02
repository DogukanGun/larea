import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Imprint",
  description: "Legal notice (Impressum) for Larea.",
};

export default function ImprintPage() {
  const { owner } = site;
  return (
    <LegalPage eyebrow="Legal" title="Imprint" intro="Impressum: information under § 5 DDG">
      <h2>Provider</h2>
      <p>
        {owner.name}
        <br />
        {owner.street}
        <br />
        {owner.city}
        <br />
        {owner.country}
      </p>

      <h2>Contact</h2>
      <p>
        Email: <a href={`mailto:${site.email}`}>{site.email}</a>
      </p>

      <h2>Responsible for content</h2>
      <p>
        Under § 18(2) MStV: {owner.name}, address as above.
      </p>

      <h2>Consumer dispute resolution</h2>
      <p>
        We are neither obliged nor willing to take part in dispute resolution proceedings before a consumer arbitration board.
      </p>
    </LegalPage>
  );
}
