import Link from "next/link";
import { LEGAL_LINKS } from "@/lib/site";

/** Footer link row shown on sign-in, sign-up and every public page. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 ${className}`}
    >
      {LEGAL_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="hover:text-slate-900 hover:underline">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
