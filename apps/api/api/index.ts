// Vercel's file-based function routing picks up anything under /api.
// This just re-exports the real adapter so there is exactly one
// implementation (src/adapters/vercel.ts) — see docs/ADR/007.
export { default } from "../src/adapters/vercel.js";
