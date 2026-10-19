import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Contact & grievances" };

export default function ContactPage() {
  return (
    <LegalPage title="Contact &amp; grievances" updated={false}>
      <Section title="Support">
        <p>
          Email <strong>{SITE.supportEmail}</strong>. Please never send passwords or full account
          numbers; we will never ask for them.
        </p>
      </Section>
      <Section title="Grievance Officer">
        <p>
          {SITE.grievanceOfficer}
          <br />
          {SITE.operator}
          <br />
          {SITE.address}
          <br />
          Email: {SITE.supportEmail}
        </p>
        <p>
          We acknowledge complaints within 48 hours and aim to resolve them within 30 days. If
          you&rsquo;re not satisfied, you can approach the Data Protection Board of India under the
          Digital Personal Data Protection Act, 2023.
        </p>
      </Section>
      <Section title="Reporting a security problem">
        <p>
          If you believe you&rsquo;ve found a vulnerability, email {SITE.supportEmail} with the
          subject &ldquo;Security&rdquo;. Please give us reasonable time to fix it before disclosing
          it publicly. We&rsquo;ll respond within 72 hours.
        </p>
      </Section>
    </LegalPage>
  );
}
