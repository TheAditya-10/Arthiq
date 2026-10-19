import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, LegalPage, Section } from "@/components/legal/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`${SITE.name} helps you track your own money. This policy explains exactly what we collect, why, who can see it, and how you can take it back or delete it. We don't sell your data and we don't show ads.`}
    >
      <Section title="1. Who we are">
        <p>
          {SITE.name} is operated by {SITE.operator}, {SITE.address}. For anything privacy-related,
          write to {SITE.supportEmail} or see{" "}
          <Link className="underline" href="/contact">
            Contact &amp; grievances
          </Link>
          .
        </p>
      </Section>

      <Section title="2. What we collect">
        <p>
          <strong>Account details:</strong> your email address, your name and timezone, and a salted
          scrypt hash of your password (we never store the password itself).
        </p>
        <p>
          <strong>Financial records you create or let us capture:</strong> account names and
          balances you enter, transactions (amount, debit/credit, date and time, merchant or payee
          text, optional reference number, your category and notes), people and split-bill ledger
          entries, events, categories, and imports of your own statements.
        </p>
        <p>
          <strong>From notifications (Android, only if you turn it on):</strong> when a supported
          payment app or bank-alert message arrives, the app extracts only the amount, debit/credit,
          merchant/payee, time and reference number. The full notification text stays on your phone
          and is discarded after parsing.
        </p>
        <p>
          <strong>Technical data:</strong> sign-in sessions (a hashed refresh token, device
          user-agent and timestamps) and standard server logs. Logs never contain passwords, tokens
          or notification text.
        </p>
      </Section>

      <Section title="3. What we never collect">
        <Bullets
          items={[
            "Notifications or messages from apps you haven't allowed — they are discarded on your phone the moment they arrive.",
            "One-time passwords, verification codes, PINs and passwords — messages containing them are dropped before anything else happens.",
            "Your SMS inbox, call logs, contacts, photos, location or microphone. The app doesn't request those permissions.",
            "Bank logins, card numbers or UPI PINs. We cannot move money; we only record what happened.",
          ]}
        />
      </Section>

      <Section title="4. Why we use it">
        <Bullets
          items={[
            "To show your transactions, categories, balances and who-owes-what.",
            "To reconcile your records against a statement you import.",
            "To keep your account secure (sign-in, abuse prevention, rate limiting).",
            "To fix bugs and keep the service running.",
          ]}
        />
        <p>
          We use your data only to provide {SITE.name} to you. We do not use it for advertising or
          profiling, and we do not sell or rent it.
        </p>
      </Section>

      <Section title="5. Who else sees it">
        <p>
          <strong>Hosting and database providers</strong> process data on our behalf to run the
          service. They cannot use it for their own purposes.
        </p>
        <p>
          <strong>Optional AI categorisation.</strong> If enabled on the server, when our own rules
          can&rsquo;t categorise a transaction we may send only the merchant name, amount, direction
          and the names of your categories to an AI provider (Anthropic) to suggest a category. We
          never send raw notification text, your name or email, or other transactions.
        </p>
        <p>
          We may disclose data if the law requires it. We will not hand over more than we must, and
          we will tell you where we are allowed to.
        </p>
      </Section>

      <Section title="6. How long we keep it">
        <p>
          We keep your data while your account exists. When you delete your account, everything tied
          to it is permanently removed from our database straight away. Routine backups age out on
          the provider&rsquo;s normal rotation.
        </p>
      </Section>

      <Section title="7. Your rights and controls">
        <Bullets
          items={[
            "Access and portability: Settings → Download my data gives you a complete JSON copy.",
            "Correction: edit or void any transaction, account or category yourself.",
            "Deletion: Settings → Delete account removes your account and all your data permanently (see the Delete account page, which works even if you can't sign in to the app).",
            "Withdraw consent: on Android you can switch off Notification access at any time, or turn off individual payment apps in Settings → What Arth-IQ reads, without losing anything already recorded.",
            "Complaints: contact our Grievance Officer below. You may also approach the Data Protection Board of India under the Digital Personal Data Protection Act, 2023.",
          ]}
        />
      </Section>

      <Section title="8. Security">
        <p>
          Traffic is encrypted in transit (HTTPS). Passwords are hashed with scrypt. Sessions use
          short-lived access tokens and rotating refresh tokens, and sign-in is rate-limited. Every
          record is tied to your account and checked on every request. See{" "}
          <Link className="underline" href="/trust">
            How we protect your data
          </Link>{" "}
          for detail. No system is perfectly secure; if a breach affects you we will tell you and
          the authorities as the law requires.
        </p>
      </Section>

      <Section title="9. Children">
        <p>
          {SITE.name} is not meant for anyone under 18, and we don&rsquo;t knowingly collect their
          data.
        </p>
      </Section>

      <Section title="10. Changes">
        <p>
          If we change this policy in a way that matters, we will update the date above and notify
          you in the app before it takes effect.
        </p>
      </Section>

      <Section title="11. Grievance Officer">
        <p>
          {SITE.grievanceOfficer}, {SITE.operator}. Email: {SITE.supportEmail}. We acknowledge
          complaints within 48 hours and aim to resolve them within 30 days.
        </p>
      </Section>
    </LegalPage>
  );
}
