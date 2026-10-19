import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Support",
  description: "Help with Larea: joining chats, passwords, the age check, safety, message pins, the marketplace, wallets and deleting your account.",
};

const faq: [string, React.ReactNode][] = [
  [
    "Why can't I join a chat?",
    "You need to be within 200 metres of the place, with precise location turned on for Larea. Indoors GPS can be weak: step outside for a moment or wait a few seconds for a better fix. Mock-location apps are blocked.",
  ],
  [
    "I forgot my password.",
    "On the sign-in screen tap Forgot password?, enter your email and tap Send code. We email you a six-digit code that works for 15 minutes; enter it with a new password and you're signed in. Other devices are signed out. No email after a few minutes? Check your spam folder, or tap Send a new code.",
  ],
  [
    "What is a message pin?",
    "A paid message you place anywhere on the map: long-press the map or tap Pin a message. The price depends on how far away it is, and people near the pin can chat under it while you moderate that chat. Purchases on iPhone and Android go through the App Store or Google Play; ask them for a refund.",
  ],
  [
    "How does the 18+ check work?",
    "Larea asks your phone for your age range (Apple's Declared Age Range or Google Play Age Signals). Where your platform gives no answer, you confirm that you're 18 or older yourself. We never see your birthday or an ID.",
  ],
  [
    "Someone is bothering me. What do I do?",
    "Long-press their message and choose Block or Report. Blocked people disappear for you right away. We review reports, usually within 24 hours. If you're in danger, call the local emergency number (112 in the EU).",
  ],
  [
    "Why was my message masked or not sent?",
    "Every message is checked before others see it. Parts that break the community rules are masked, and some messages are blocked. Repeated violations lead to a temporary mute. If you think we got it wrong, email us.",
  ],
  [
    "How does paying for a marketplace deal work?",
    "The buyer pays in the app. When you meet, the buyer shows a six-digit handover code and the seller enters it, which releases the money. Don't share your code before you have the item. If the handover doesn't happen, cancel the deal for a refund.",
  ],
  [
    "Which wallets work with the Solana version?",
    "Any wallet that supports Mobile Wallet Adapter: the Seeker's Seed Vault wallet, Phantom, Solflare and others. Connect it in Profile → Wallet. Larea never holds your keys.",
  ],
  [
    "I checked in but my stamp didn't appear.",
    "Stamps confirm within a few seconds once your wallet has sent the transaction. If it says it's still being confirmed, wait a moment and open My stamps again. Make sure your wallet has a little SOL for the network fee.",
  ],
];

export default function SupportPage() {
  return (
    <LegalPage
      eyebrow="Help"
      title="Support"
      intro={
        <>
          Can&apos;t find an answer? Email <a href={`mailto:${site.email}?subject=Larea%20support`}>{site.email}</a>. We
          reply within two working days.
        </>
      }
    >
      <h2>Frequently asked</h2>
      <div className="faq">
        {faq.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>

      <h2 id="delete">Delete your account</h2>
      <ol>
        <li>Open Larea and go to the Profile tab.</li>
        <li>Scroll down and tap Delete account, then confirm.</li>
      </ol>
      <p>
        Your email, display name and password are erased immediately, and your open listings and offers are closed.
      </p>
      <p>
        Can&apos;t open the app any more? Email us from the address of your account and we&apos;ll delete it for you. Details
        are in the <Link href="/privacy#retention">Privacy Policy</Link>.
      </p>

      <h2 id="report">Report illegal content</h2>
      <p>
        Use Report in the app, or email <a href={`mailto:${site.email}?subject=Report`}>{site.email}</a> with a description
        and, if you can, the place and time. This is also our point of contact under the EU Digital Services Act; we answer in
        English or German.
      </p>
    </LegalPage>
  );
}
