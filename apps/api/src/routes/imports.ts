import type { FastifyInstance } from "fastify";
import { commitImportSchema } from "@arthiq/validation";

import { commitImport, getImport, previewImport } from "../services/import.service.js";
import { ApiError } from "../lib/errors.js";
import { parseOrThrow } from "../lib/validate.js";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — a bank statement CSV is never anywhere near this

export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.requireAuth);

  app.post("/imports/preview", async (request, reply) => {
    let accountId: string | undefined;
    let fileName: string | undefined;
    let csvText: string | undefined;

    for await (const part of request.parts({ limits: { fileSize: MAX_FILE_SIZE_BYTES } })) {
      if (part.type === "file" && part.fieldname === "file") {
        fileName = part.filename;
        const buffer = await part.toBuffer();
        csvText = buffer.toString("utf-8");
      } else if (part.type === "field" && part.fieldname === "accountId") {
        accountId = String(part.value);
      }
    }

    if (!accountId || !csvText || !fileName) {
      throw new ApiError(
        "Expected multipart fields 'accountId' and 'file'",
        400,
        "VALIDATION_ERROR",
      );
    }

    const result = await previewImport(app.prisma, request.userId!, accountId, fileName, csvText);
    reply.status(201);
    return result;
  });

  app.post("/imports/:id/commit", async (request) => {
    const { id } = request.params as { id: string };
    const input = parseOrThrow(commitImportSchema, request.body);
    const { import: record, results } = await commitImport(
      app.prisma,
      request.userId!,
      id,
      input.columnMapping,
    );
    return {
      id: record.id,
      status: record.status,
      rowCount: record.rowCount,
      importedCount: record.importedCount,
      duplicateCount: record.duplicateCount,
      errorCount: record.errorCount,
      results,
    };
  });

  app.get("/imports/:id", async (request) => {
    const { id } = request.params as { id: string };
    const record = await getImport(app.prisma, request.userId!, id);
    return {
      id: record.id,
      accountId: record.accountId,
      fileName: record.fileName,
      status: record.status,
      rowCount: record.rowCount,
      importedCount: record.importedCount,
      duplicateCount: record.duplicateCount,
      errorCount: record.errorCount,
    };
  });
}
