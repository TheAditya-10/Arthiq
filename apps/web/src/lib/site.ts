/**
 * Public, legally relevant details shown on the Privacy / Terms / Contact
 * pages. Set these in the web app's environment before publishing — the
 * fallbacks are deliberately obvious placeholders so nobody ships a policy
 * naming a contact that doesn't exist.
 */
export const SITE = {
  name: "Arth-IQ",
  operator:
    process.env.NEXT_PUBLIC_OPERATOR_NAME ??
    "[Operator legal name — set NEXT_PUBLIC_OPERATOR_NAME]",
  supportEmail:
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "[support email — set NEXT_PUBLIC_SUPPORT_EMAIL]",
  grievanceOfficer:
    process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER ??
    "[Grievance Officer name — set NEXT_PUBLIC_GRIEVANCE_OFFICER]",
  address:
    process.env.NEXT_PUBLIC_OPERATOR_ADDRESS ??
    "[Registered address — set NEXT_PUBLIC_OPERATOR_ADDRESS]",
  /** Bump when the policy text materially changes. */
  policyUpdated: "13 October 2026",
} as const;

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/trust", label: "How we protect your data" },
  { href: "/delete-account", label: "Delete your account" },
  { href: "/contact", label: "Contact & grievances" },
] as const;
