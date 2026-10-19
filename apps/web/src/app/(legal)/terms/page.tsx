import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, LegalPage, Section } from "@/components/legal/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms are the agreement between you and ${SITE.operator} for using ${SITE.name}. By creating an account or using the app you accept them.`}
    >
      <Section title="1. What the service is">
        <p>
          {SITE.name} is a personal bookkeeping tool: it records, categorises and reconciles
          transactions you enter, import, or allow it to capture from notifications. It is{" "}
          <strong>not</strong> a bank, payment service, lender, broker or financial adviser. We do
          not hold or move your money, and nothing in the app is financial, tax or legal advice.
        </p>
      </Section>

      <Section title="2. Your account">
        <Bullets
          items={[
            "You must be 18 or older and provide accurate information.",
            "Keep your password secret. You are responsible for activity under your account; tell us promptly if you suspect misuse.",
            "One person per account. Don't share it or use it for anyone else's finances without their agreement.",
          ]}
        />
      </Section>

      <Section title="3. Notification access (Android)">
        <p>
          Automatic capture needs Android&rsquo;s Notification access, which you grant yourself in
          system settings after reading an explanation in the app. You choose which apps are read
          and can switch this off whenever you like. What happens to that data is set out in the{" "}
          <Link className="underline" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section title="3A. Accuracy">
        <p>
          Capturing from notifications is best-effort. Apps change their wording and Android may
          delay or drop notifications, so a payment can be missed or categorised wrongly. Check your
          records against your bank statement, and use the reconciliation tools, before relying on
          any figure.
        </p>
      </Section>

      <Section title="4. Acceptable use">
        <p>You agree not to:</p>
        <Bullets
          items={[
            "break the law or use the service to record or launder proceeds of crime;",
            "probe, attack, overload or reverse-engineer the service, or bypass its limits or security;",
            "access another person's account or data;",
            "upload malicious files or content you have no right to use.",
          ]}
        />
      </Section>

      <Section title="5. Your data">
        <p>
          Your data stays yours. You give us only the permission needed to store and process it to
          run the service for you. You can export it or delete your account at any time.
        </p>
      </Section>

      <Section title="6. Availability and changes">
        <p>
          We work to keep the service running but don&rsquo;t promise it will be uninterrupted or
          error-free. We may change or retire features, and will give reasonable notice of anything
          that significantly affects you. We may suspend accounts that breach these terms.
        </p>
      </Section>

      <Section title="7. Liability">
        <p>
          The service is provided &ldquo;as is&rdquo;. To the extent the law allows, we are not
          liable for indirect or consequential losses, or for loss caused by missed or wrongly
          categorised transactions, outages, or your device or network. Nothing here limits
          liability that cannot lawfully be limited.
        </p>
      </Section>

      <Section title="8. Ending the agreement">
        <p>
          You may stop using {SITE.name} and delete your account at any time (see{" "}
          <Link className="underline" href="/delete-account">
            Delete your account
          </Link>
          ). We may end or suspend access if you seriously or repeatedly breach these terms.
        </p>
      </Section>

      <Section title="9. Governing law">
        <p>
          These terms are governed by the laws of India. Courts at the operator&rsquo;s registered
          location have jurisdiction, subject to any rights you have as a consumer.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Questions about these terms: {SITE.supportEmail}. See also{" "}
          <Link className="underline" href="/contact">
            Contact &amp; grievances
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
