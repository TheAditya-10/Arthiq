import type { ZodType } from "zod";
import { ApiError } from "./errors.js";

/**
 * Parses `input` against `schema`, throwing an ApiError(400) with issue
 * details on failure. The schema parameter is typed `ZodType<Output, any,
 * any>` (not the default `ZodType<Output>`, which pins Input = Output) so
 * that schemas with `.default()`/`.transform()` — where Input and Output
 * genuinely differ — still infer T as the Output type, not some unsound
 * merge of both.
 */
export function parseOrThrow<Output>(schema: ZodType<Output, any, any>, input: unknown): Output {
  const result = schema.safeParse(input);
  if (!result.success) {
    const error = new ApiError("Invalid input", 400, "VALIDATION_ERROR");
    (error as ApiError & { details?: unknown }).details = result.error.issues;
    throw error;
  }
  return result.data;
}
