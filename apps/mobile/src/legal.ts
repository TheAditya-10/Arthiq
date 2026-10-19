import { Linking } from "react-native";

/**
 * Base URL of the public website that hosts the Privacy Policy, Terms and
 * account-deletion pages. Baked in at build time like EXPO_PUBLIC_API_URL.
 * When unset (e.g. a local dev build) the links are simply not shown; the
 * disclosure screen itself never depends on it.
 */
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "").replace(/\/+$/, "");

export type LegalPage = "privacy" | "terms" | "trust" | "delete-account" | "contact";

export const LEGAL_LABELS: Record<LegalPage, string> = {
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  trust: "How we protect your data",
  "delete-account": "Delete account page",
  contact: "Contact & grievances",
};

export function legalUrl(page: LegalPage): string | null {
  return WEB_URL ? `${WEB_URL}/${page}` : null;
}

export function openLegal(page: LegalPage): void {
  const url = legalUrl(page);
  if (url) void Linking.openURL(url);
}
