import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Larea collects, why, who processes it, how long it is kept, and your rights under the GDPR.",
};

const toc = [
  { id: "controller", label: "Who we are" },
  { id: "summary", label: "In short" },
  { id: "data", label: "What we process" },
  { id: "solana", label: "Solana build" },
  { id: "recipients", label: "Service providers" },
  { id: "retention", label: "How long" },
  { id: "rights", label: "Your rights" },
  { id: "website", label: "This website" },
];

export default function PrivacyPage() {
  const { owner } = site;
  return (
    <LegalPage eyebrow="Legal" title="Privacy Policy" intro={`Last updated ${site.legalUpdated}`} toc={toc}>
      <h2 id="controller">1. Who is responsible</h2>
      <p>
        The controller for the Larea apps (iOS, Android and the Solana dApp Store build), the Larea service and this website,
        within the meaning of the EU General Data Protection Regulation (GDPR), is:
      </p>
      <p>
        {owner.name}
        <br />
        {owner.street}
        <br />
        {owner.city}, {owner.country}
        <br />
        Email: <a href={`mailto:${site.email}`}>{site.email}</a>
      </p>
      <p>We have not appointed a data protection officer, as the law does not require one for us. Write to the address above with any privacy question.</p>

      <h2 id="summary">2. In short</h2>
      <ul>
        <li>We use your location to check that you are at a place. Other users never see your location.</li>
        <li>Your age is checked through your phone’s own age signal. We keep pass or fail, never a birthday or an ID document.</li>
        <li>Messages and photos are checked by an automated moderation service before anyone sees them, and are deleted after 7 days.</li>
        <li>There are no ads and no analytics or tracking SDKs in the apps. We do not sell your data.</li>
        <li>Our server is in Nuremberg, Germany.</li>
        <li>In the Solana build, whatever is written to the Solana blockchain is public and permanent. We explain this in section 4.</li>
      </ul>

      <h2 id="data">3. What we process and why</h2>

      <h3>Account</h3>
      <p>
        Your email address, display name and a password (stored only as a salted hash), plus sign-in sessions, which record
        the device name your phone reports. <em>Purpose:</em> providing your account. <em>Legal basis:</em> performance of
        our contract with you (Art. 6(1)(b) GDPR).
      </p>

      <h3>Age assurance (18+)</h3>
      <p>
        Larea is only for adults. The app asks your phone for your age range (Apple&apos;s Declared Age Range on iOS, Google
        Play Age Signals on Android). Where the platform gives no answer, you confirm yourself that you are 18 or older. We
        store which platform answered, the kind of declaration, the result (passed or not) and the time. We never receive or
        store your birthday, your exact age or an identity document. <em>Legal basis:</em> Art. 6(1)(b) and our legitimate
        interest in keeping minors out of an adult chat service (Art. 6(1)(f) GDPR).
      </p>

      <h3>Location</h3>
      <p>
        With your permission, the app sends your precise location to our server:
      </p>
      <ul>
        <li>when it shows places near you;</li>
        <li>when you join a chat;</li>
        <li>at regular intervals while you are in a chat, so we can see you are still there;</li>
        <li>when you post or make an offer in the marketplace.</li>
      </ul>
      <p>
        We use it to decide whether you are close enough (200 m for chats, a larger radius for the marketplace) and to stop
        faked locations. Your last position is kept in memory for about 5 minutes for that plausibility check. It is not written
        to our database, and it is removed from our server logs.
      </p>
      <p>
        We store which chat you joined and when. That record is deleted 30 days after you leave.
      </p>
      <p>
        Marketplace listings store the position where you posted them. Other users only see a rounded position, about 150 m
        across, and a rounded distance.
      </p>
      <p>
        <em>Legal basis:</em> Art. 6(1)(b) GDPR. You can withdraw the location permission in your phone&apos;s settings at any
        time, but you then can&apos;t join chats.
      </p>

      <h3>Messages, photos, polls and reports</h3>
      <p>
        <strong>What we keep.</strong> We store what you post in a chat, together with your display name and the time. Photos
        are re-encoded on our server, and their metadata (such as EXIF location) is removed before anyone can see them.
      </p>
      <p>
        <strong>Moderation.</strong> To protect other users, every message, photo and poll is checked automatically before it
        is shown, and the result is stored with it. A message may then be shown, partly masked or blocked. Repeated violations
        can lead to a temporary mute or a suspension; you can always contact us about a decision.
      </p>
      <p>
        <strong>Reports and blocks.</strong> We store the reports you make and the people you block.
      </p>
      <p>
        <em>Legal basis:</em> Art. 6(1)(b) GDPR, and our legitimate interest in a safe service and in complying with platform
        rules and the EU Digital Services Act (Art. 6(1)(f) GDPR).
      </p>

      <h3>Marketplace and payments</h3>
      <p>
        We store your listings (title, description, photos, price, category, position), the offers and the resulting deals.
        Card payments and seller payouts are processed by Stripe (see section 5). We receive the payment status but never your
        card details. Sellers who set up payouts give their identity and bank details directly to Stripe.
      </p>
      <p>
        Deal records are kept as long as commercial and tax law requires (up to 10 years in Germany).
      </p>
      <p>
        <em>Legal basis:</em> Art. 6(1)(b) and (c) GDPR.
      </p>

      <h3>Technical data</h3>
      <p>
        When the app talks to our server, the server briefly logs technical data for security and troubleshooting: IP address,
        time, the request and the response status. Locations, passwords and tokens are removed from these logs, and they are
        rotated within a few weeks.
      </p>
      <p>
        <em>Legal basis:</em> legitimate interest in running a secure service (Art. 6(1)(f) GDPR).
      </p>

      <h3>What we don&apos;t do</h3>
      <p>
        No advertising, no analytics or crash-reporting SDKs, no selling or sharing of data for marketing, and no profiling
        beyond the moderation described above.
      </p>

      <h2 id="solana">4. The Solana dApp Store build</h2>
      <p>
        The version of Larea distributed in the Solana dApp Store adds features that use your own Solana wallet. If you link a
        wallet, we also store your public wallet address, your check-in stamps, your loyalty levels, tips, USDC deals, perks and
        rewards, together with the transaction signatures.
      </p>
      <p className="callout">
        <strong>Public and permanent.</strong> A blockchain is a public ledger that nobody can edit or delete, us included.
        Check-in stamps and level badges are NFTs in your wallet, and their public metadata includes the place&apos;s name and
        the date. Tips and payments are visible as token transfers between wallet addresses. Anyone who knows your wallet
        address can therefore see where and when you checked in. Only link a wallet if you are comfortable with that.
        Unlinking it or deleting your Larea account does not remove anything that is already on-chain.
      </p>
      <p>
        Larea never holds your private keys; your wallet app signs every transaction. Market payments in USDC are held in a
        Larea escrow wallet until the handover, then paid out or refunded. Transactions go through a Solana RPC provider. On
        that basis, Art. 6(1)(b) GDPR applies.
      </p>

      <h2 id="recipients">5. Service providers</h2>
      <p>
        We only share data with providers we need to run Larea. Where they act on our behalf, it is under a data processing
        agreement.
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>What for</th>
            <th>Where</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Hetzner Online GmbH</td>
            <td>Hosting our server and database</td>
            <td>Nuremberg, Germany</td>
          </tr>
          <tr>
            <td>OpenAI (OpenAI Ireland Ltd. / OpenAI, L.L.C.)</td>
            <td>
              Automated moderation of message text, photos, display names and listings. API data is not used to train
              OpenAI&apos;s models.
            </td>
            <td>EU / USA (EU–US Data Privacy Framework, Standard Contractual Clauses)</td>
          </tr>
          <tr>
            <td>Stripe Payments Europe Ltd.</td>
            <td>Card payments and seller payouts in the marketplace</td>
            <td>Ireland / USA</td>
          </tr>
          <tr>
            <td>Apple and Google</td>
            <td>The age-range signal on your phone; app distribution</td>
            <td>Under their own privacy policies</td>
          </tr>
          <tr>
            <td>Map tiles: Apple Maps (iOS), OpenFreeMap (Android)</td>
            <td>Drawing the map; the map provider sees your IP address and which map area is loaded</td>
            <td>Apple: under Apple&apos;s policy · OpenFreeMap: EU</td>
          </tr>
          <tr>
            <td>OpenStreetMap / Overpass API</td>
            <td>Looking up public places for an area. Our server makes these requests; no personal data is sent.</td>
            <td>EU</td>
          </tr>
          <tr>
            <td>Solana network and RPC provider (Solana build only)</td>
            <td>Sending and reading transactions for linked wallets</td>
            <td>Global, public network</td>
          </tr>
          <tr>
            <td>Vercel Inc.</td>
            <td>Hosting this website (not the apps&apos; data)</td>
            <td>Global edge network / USA (DPF, SCCs)</td>
          </tr>
        </tbody>
      </table>
      <p>We share data with authorities only where the law obliges us to, for example in response to a lawful court order.</p>

      <h2 id="retention">6. How long we keep data</h2>
      <table>
        <tbody>
          <tr>
            <td>Chat messages and their photos</td>
            <td>7 days</td>
          </tr>
          <tr>
            <td>Messages that were reported or caused an incident, moderation records</td>
            <td>90 days</td>
          </tr>
          <tr>
            <td>Your last location</td>
            <td>About 5 minutes, in memory</td>
          </tr>
          <tr>
            <td>Chat memberships (which place, when)</td>
            <td>30 days after leaving</td>
          </tr>
          <tr>
            <td>Closed marketplace listings and their photos</td>
            <td>30 days after closing</td>
          </tr>
          <tr>
            <td>Deal and payment records</td>
            <td>As required by commercial and tax law (up to 10 years)</td>
          </tr>
          <tr>
            <td>Sign-in sessions</td>
            <td>Until they expire (30 days) or you sign out</td>
          </tr>
          <tr>
            <td>Account</td>
            <td>Until you delete it</td>
          </tr>
          <tr>
            <td>Blockchain data (Solana build)</td>
            <td>Permanent, out of anyone&apos;s control</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>Deleting your account:</strong> Profile → Delete account in the app, or email us. Your email address, display
        name and password are erased immediately. Your sessions end, and your open listings and offers are closed.
      </p>
      <p>
        What you already posted shows as &quot;Deleted user&quot; until it expires under the periods above. Deal records stay
        only as long as the law requires.
      </p>

      <h2 id="rights">7. Your rights</h2>
      <p>Under the GDPR you have the right to:</p>
      <ul>
        <li>access the data we hold about you (Art. 15);</li>
        <li>have it corrected (Art. 16);</li>
        <li>have it erased (Art. 17);</li>
        <li>restrict its processing (Art. 18);</li>
        <li>receive it in a portable format (Art. 20);</li>
        <li>
          <strong>object</strong> to processing based on legitimate interests (Art. 21);
        </li>
        <li>withdraw any consent at any time, without affecting what happened before.</li>
      </ul>
      <p>
        To use them, email <a href={`mailto:${site.email}`}>{site.email}</a> from the address of your account.
      </p>
      <p>
        You can also complain to a supervisory authority. Ours is the Bavarian Data Protection Authority (Bayerisches Landesamt
        für Datenschutzaufsicht, Promenade 18, 91522 Ansbach, www.lda.bayern.de).
      </p>
      <p>
        Larea is not meant for anyone under 18. If we learn that a minor has an account, we delete it.
      </p>

      <h2 id="website">8. This website</h2>
      <p>
        This website sets no cookies and uses no analytics or tracking. Fonts are served from this website itself, not from
        third parties.
      </p>
      <p>
        Our host (Vercel) processes your IP address and request data to deliver the pages and to protect against attacks, on
        the basis of our legitimate interest (Art. 6(1)(f) GDPR). Email links open your own mail app.
      </p>

      <h2>9. Changes</h2>
      <p>
        We update this policy when Larea changes. The date at the top shows the current version. For important changes we
        will tell you in the app. See also our <Link href="/terms">Terms of Use</Link>.
      </p>
    </LegalPage>
  );
}
