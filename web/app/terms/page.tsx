import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The rules for using Larea: who can join, what is not allowed, the marketplace and the Solana features.",
};

const toc = [
  { id: "who", label: "Who can use Larea" },
  { id: "rules", label: "Community rules" },
  { id: "moderation", label: "Moderation" },
  { id: "market", label: "Marketplace" },
  { id: "solana", label: "Solana features" },
  { id: "liability", label: "Liability" },
];

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Legal" title="Terms of Use" intro={`Last updated ${site.legalUpdated}`} toc={toc}>
      <p>
        These terms apply to the Larea apps for iOS, Android and the Solana dApp Store, and to the Larea service, offered by{" "}
        {site.owner.name}, {site.owner.street}, {site.owner.city} (&quot;Larea&quot;, &quot;we&quot;). By creating an account
        you agree to them. How we handle your data is explained in the <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2 id="who">1. Who can use Larea</h2>
      <ul>
        <li>You must be at least 18 years old and pass the in-app age check. Accounts of minors are deleted.</li>
        <li>One account per person. Keep your password to yourself; you are responsible for what happens in your account.</li>
        <li>
          Chats are tied to real places. Only join from where you actually are: faking your location (mock locations, GPS
          spoofing) is not allowed.
        </li>
      </ul>

      <h2 id="rules">2. Community rules</h2>
      <p>Larea has zero tolerance for objectionable content and abusive users. You must not post, send or offer:</p>
      <ul>
        <li>harassment, bullying, threats, or calls for violence;</li>
        <li>hate speech or discrimination based on origin, religion, gender, sexual orientation, disability or similar;</li>
        <li>sexual content, nudity, or anything that sexualises minors (reported to the authorities);</li>
        <li>personal information about others (addresses, phone numbers, photos taken without consent);</li>
        <li>spam, scams, impersonation, or attempts to move deals and payments off the platform to defraud others;</li>
        <li>illegal goods or services, weapons, drugs, counterfeit items or anything else prohibited by law;</li>
        <li>content you don&apos;t have the rights to.</li>
      </ul>
      <p>
        Be the person you&apos;d be at that place in real life. If you meet someone from Larea, meet in public and trust your
        judgement.
      </p>

      <h2 id="moderation">3. Moderation, reports and blocking</h2>
      <p>
        <strong>Before it&apos;s shown.</strong> Every message, photo, poll, display name and listing is checked automatically
        before others see it. Content that breaks these rules may be masked or blocked.
      </p>
      <p>
        <strong>Report and block.</strong> You can report any message or listing, and block any user, from inside the app.
        Blocked users and their messages disappear for you. We review reports and act on them, usually within 24 hours.
      </p>
      <p>
        <strong>Enforcement.</strong> Depending on how serious and how frequent a violation is, we may:
      </p>
      <ul>
        <li>warn you;</li>
        <li>mute you temporarily;</li>
        <li>remove your content;</li>
        <li>suspend your account, or close it permanently.</li>
      </ul>
      <p>
        If you think a decision was wrong, write to <a href={`mailto:${site.email}`}>{site.email}</a> and a human will look at
        it.
      </p>
      <p>
        <strong>Your content.</strong> It stays yours. You give us the non-exclusive right to store, process and show it inside
        Larea for as long as it exists there; that is what running the chat requires. Chats are temporary: messages are deleted
        after 7 days.
      </p>

      <h2 id="market">4. Marketplace</h2>
      <ul>
        <li>
          Listings and deals are between users. Larea is not the seller or buyer and does not check items. Describe items
          honestly, and only list things you are allowed to sell.
        </li>
        <li>
          Card deals are paid inside the app and processed by Stripe. The money is released to the seller when they enter the
          buyer&apos;s six-digit handover code at the meeting.
        </li>
        <li>
          If no handover happens, the buyer can cancel and is refunded, and unconfirmed deals are refunded automatically after
          a waiting period. Never share your handover code before you have the item.
        </li>
        <li>
          Larea charges the seller a service fee on completed deals, shown before you accept an offer (currently 10%, at least
          €0.50).
        </li>
        <li>
          Report disputes and suspicious listings in the app; we can decide disputed deals and refund or release the payment.
        </li>
      </ul>

      <h2 id="solana">5. Solana features (dApp Store build)</h2>
      <ul>
        <li>
          <strong>Your wallet.</strong> These features use a Solana wallet that you control. Larea never holds your keys. You
          are responsible for your wallet, its security and the transactions you approve. Network fees for transactions you
          sign are paid from your wallet.
        </li>
        <li>
          <strong>Stamps and badges</strong> are non-transferable records of your visits and levels. They are not investments,
          have no promised monetary value, and can&apos;t be sold through Larea.
        </li>
        <li>
          <strong>Tips</strong> go directly from your wallet to the recipient&apos;s wallet and cannot be reversed by us.
        </li>
        <li>
          <strong>USDC deals</strong> are paid into a Larea escrow wallet, released to the seller with the handover code, or
          refunded on cancellation, as described in section 4.
        </li>
        <li>
          <strong>SKR rewards and perks</strong> are voluntary extras. We can change or end them at any time, and claims are
          limited to what a perk states.
        </li>
        <li>
          <strong>Blockchains are public and permanent.</strong> Transactions are final once confirmed. While a feature runs on
          a test network (devnet), its tokens have no value.
        </li>
        <li>
          Larea is not a bank, exchange or financial adviser. Crypto assets can lose value. Use these features only as allowed
          where you live.
        </li>
      </ul>

      <h2 id="liability">6. Availability and liability</h2>
      <p>
        Larea is in beta and offered free of charge. We work to keep it available, but features can change and the service can
        be interrupted.
      </p>
      <p>
        We are liable without limitation for intent and gross negligence, for injury to life, body or health, and under the
        German Product Liability Act. For slight negligence we are only liable for breaching an essential contractual obligation,
        limited to the typical, foreseeable damage. Otherwise our liability is excluded.
      </p>
      <p>We are not responsible for content posted by users or for deals between users.</p>

      <h2>7. Ending your account</h2>
      <p>
        You can delete your account at any time in the app (Profile → Delete account). We may close accounts that seriously or
        repeatedly break these terms.
      </p>

      <h2>8. Changes and law</h2>
      <p>
        We may update these terms. We will tell you in the app before significant changes take effect. If you don&apos;t agree,
        you can delete your account.
      </p>
      <p>
        German law applies, except where mandatory consumer protection in your country gives you stronger rights.
      </p>
      <p>
        The European Commission&apos;s online dispute resolution platform has been discontinued. We are neither obliged nor
        willing to take part in dispute resolution proceedings before a consumer arbitration board.
      </p>
      <p>
        Questions: <a href={`mailto:${site.email}`}>{site.email}</a>.
      </p>
    </LegalPage>
  );
}
