// Public pages: no sign-in needed (Play Store and users must be able to open
// the privacy policy and account-deletion page without an account).
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
