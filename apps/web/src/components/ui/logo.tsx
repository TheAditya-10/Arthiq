import Image from "next/image";
import logoMark from "@/assets/logo-mark.png";

/** Arth-IQ mark plus wordmark. */
export function Logo({
  size = 36,
  showWordmark = true,
  light = false,
}: {
  size?: number;
  showWordmark?: boolean;
  light?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image src={logoMark} alt="Arth-IQ logo" width={size} height={size} priority />
      {showWordmark && (
        <span
          className={`font-extrabold tracking-tight ${light ? "text-white" : "text-slate-900"}`}
          style={{ fontSize: size * 0.6 }}
        >
          Arth<span className="text-accent">-IQ</span>
        </span>
      )}
    </span>
  );
}
