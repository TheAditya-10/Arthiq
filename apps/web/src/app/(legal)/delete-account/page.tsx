import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, LegalPage, Section } from "@/components/legal/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Delete your account" };

export default function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete your account"
      updated={false}
      intro={`You can delete your ${SITE.name} account and every piece of data in it, at any time. Deletion is permanent and immediate.`}
    >
      <Section title="In the app or on the web (fastest)">
        <Bullets
          items={[
            "Open Settings → Delete account (in the Android app or on the website).",
            "Enter your password to confirm. This protects you if someone else has your phone or an open session.",
            "Your account and all of its data are removed from our database immediately.",
          ]}
        />
        <p>
          Want a copy first? Use Settings → Download my data before you delete — it can&rsquo;t be
          recovered afterwards.
        </p>
      </Section>

      <Section title="Can't sign in?">
        <p>
          Email <strong>{SITE.supportEmail}</strong> from the address on your account with the
          subject &ldquo;Delete my account&rdquo;. We may ask a question only you can answer before
          we delete, and will confirm once it&rsquo;s done (within 7 days).
        </p>
      </Section>

      <Section title="What gets deleted">
        <Bullets
          items={[
            "Your profile and sign-in sessions.",
            "All accounts, transactions, people and split ledgers, categories, events, merchant rules and imports.",
            "The record of which notifications produced which transactions.",
          ]}
        />
        <p>
          Encrypted provider backups age out on their normal schedule. Anything we are legally
          required to keep is kept only for the legally required period.
        </p>
      </Section>

      <Section title="Only want to stop automatic capture?">
        <p>
          You don&rsquo;t need to delete anything: turn off apps in Settings → What Arth-IQ reads,
          or remove Notification access in Android settings. See the{" "}
          <Link className="underline" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
