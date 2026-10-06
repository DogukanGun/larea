import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Try the Solana build",
  description: "Download the Larea APK for Android and test it on Solana devnet: wallet, check-in stamps, place chats, tips and the USDC market.",
};

const toc = [
  { id: "install", label: "Install" },
  { id: "wallet", label: "Wallet on devnet" },
  { id: "walkthrough", label: "What to try" },
  { id: "notes", label: "Good to know" },
];

export default function TryPage() {
  return (
    <LegalPage
      eyebrow="For testers and hackathon judges"
      title="Try the Solana build"
      intro={
        <>
          The Larea app for the Solana dApp Store, as a signed APK for any Android phone (Android 8 or newer). It runs on
          Solana devnet, so nothing here costs real money.
        </>
      }
      toc={toc}
    >
      <p>
        <a className="btn btn--primary" href={site.apk.url}>
          Download Larea for Android (APK, {site.apk.sizeMb} MB)
        </a>
      </p>
      <p>
        Release notes and the SHA-256 checksum are on the <a href={site.apk.release}>GitHub release</a>. The source code is
        open at <a href={site.repo}>github.com/DogukanGun/larea</a>.
      </p>

      <h2 id="install">Install</h2>
      <ol>
        <li>Open the download on your phone. Android asks to allow installs from your browser once: allow it, then tap Install.</li>
        <li>
          Open Larea, create an account and confirm you&apos;re 18 or older. Outside Google Play the app asks you to confirm
          it yourself.
        </li>
        <li>Allow precise location. Chats belong to real places, so Larea needs to know where you are.</li>
      </ol>

      <h2 id="wallet">Wallet on devnet</h2>
      <ol>
        <li>
          Use a wallet with Mobile Wallet Adapter: the Seeker&apos;s built-in wallet, Phantom or Solflare. Switch it to{" "}
          <b>devnet</b> (in Phantom: Settings → Developer settings → Testnet mode → Solana Devnet).
        </li>
        <li>In Larea, open Profile → Wallet → Connect wallet and approve Sign In With Solana in your wallet.</li>
        <li>
          The first time you link a wallet, Larea sends it a welcome gift: a little devnet SOL for fees, 20 test USDC and 20
          test SKR, so you can check in, tip and trade right away. Need more SOL? Use{" "}
          <a href="https://faucet.solana.com">faucet.solana.com</a>.
        </li>
      </ol>

      <h2 id="walkthrough">What to try</h2>
      <ol>
        <li>
          <b>Find a place.</b> The map shows real places around you from OpenStreetMap: libraries, cafés, stations, parks.
          Any of them works when you&apos;re within 200 metres.
        </li>
        <li>
          <b>Check in.</b> Tap Check in on the place. Your wallet signs, and a soulbound check-in stamp (a compressed NFT) is
          minted to it. The stamp opens the place&apos;s chat for 24 hours.
        </li>
        <li>
          <b>Chat.</b> Send a message, a photo or a poll. Long-press or swipe a message to reply. Every message is moderated
          before anyone sees it.
        </li>
        <li>
          <b>Tip.</b> Long-press someone&apos;s message and tip them in USDC. It goes wallet to wallet.
        </li>
        <li>
          <b>Trade.</b> In Market, post a listing priced in USDC, or make an offer. The buyer pays into escrow, and the money
          is released with the six-digit handover code.
        </li>
        <li>
          <b>Come back.</b> Stamps on different days make you a Regular, Local and Legend at that place, each with a badge
          in your wallet, a Regulars room and SKR rewards.
        </li>
      </ol>

      <h2 id="notes">Good to know</h2>
      <ul>
        <li>The APK talks to our test server in Germany. Accounts and chats there may be reset between test rounds.</li>
        <li>Fake-location apps are blocked; you need to really be at a place to join its chat.</li>
        <li>
          Nobody around? Chats work with one person too. Ask a friend to install the app and join the same place to see
          replies, tips and deals between two people.
        </li>
        <li>
          Questions or problems: <a href={`mailto:${site.email}?subject=Larea%20APK`}>{site.email}</a>, or see{" "}
          <Link href="/support">Support</Link>.
        </li>
      </ul>
    </LegalPage>
  );
}
