import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, LegalPage, Section } from "@/components/legal/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "How we protect your data" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 py-2.5 last:border-0 sm:grid-cols-[11rem_1fr]">
      <dt className="font-semibold text-slate-900">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function TrustPage() {
  return (
    <LegalPage
      title="How we protect your data"
      updated={false}
      intro={`Asking for notification access is a big ask for a finance app, so here is the exact, plain-language picture of what ${SITE.name} does and doesn't do.`}
    >
      <Section title="What the app reads on your phone">
        <dl className="rounded-xl border border-slate-200/80 bg-surface px-4 text-sm">
          <Row
            label="Reads"
            value="Notifications from only the payment apps and bank-alert messages you switch on (Google Pay, PhonePe, Paytm, your Messages app)."
          />
          <Row
            label="Ignores"
            value="Every other app. Those notifications are thrown away on your phone, in memory, without being stored or sent."
          />
          <Row
            label="Drops instantly"
            value="OTPs, verification codes, PINs and passwords — even from an app you allowed."
          />
          <Row
            label="Sends to us"
            value="Only: amount, debit/credit, merchant, time and reference number. Never the full message text."
          />
          <Row
            label="Never touches"
            value="Your SMS inbox, contacts, call logs, photos, location, microphone or other apps' data. The app doesn't even request those permissions."
          />
        </dl>
      </Section>

      <Section title="You stay in control">
        <Bullets
          items={[
            "You grant Notification access yourself in Android settings, after an explanation, and can revoke it any second.",
            "A per-app switch (Settings → What Arth-IQ reads) and a master Pause button stop capture instantly.",
            "The app shows what it recently handled, so you can verify it for yourself.",
            "One tap exports everything we hold about you; another deletes it all.",
          ]}
        />
      </Section>

      <Section title="How we secure it">
        <Bullets
          items={[
            "HTTPS everywhere; strict security headers on the API; user data is never cached.",
            "Passwords hashed with scrypt; short-lived access tokens, rotating refresh tokens kept in Android's secure storage.",
            "Rate limiting on every endpoint, with tighter limits on sign-in, data export, account deletion and capture.",
            "Every database record is bound to your account and checked on every request, so users can't see each other's data.",
            "Passwords, tokens and notification text are scrubbed from server logs.",
            "Deleting your account permanently removes all your records in one step.",
          ]}
        />
      </Section>

      <Section title="What we don't do">
        <Bullets
          items={[
            "We don't sell, rent or share your financial data for advertising.",
            "We can't move money or sign in to your bank: there are no bank credentials in the app.",
            "We don't use accessibility services or screen reading — only Android's standard notification listener.",
          ]}
        />
      </Section>

      <Section title="Read the details">
        <p>
          <Link className="underline" href="/privacy">
            Privacy Policy
          </Link>{" "}
          ·{" "}
          <Link className="underline" href="/terms">
            Terms of Service
          </Link>{" "}
          ·{" "}
          <Link className="underline" href="/delete-account">
            Delete your account
          </Link>{" "}
          ·{" "}
          <Link className="underline" href="/contact">
            Contact &amp; security reports
          </Link>
        </p>
      </Section>
    </LegalPage>
  );
}
