import type { ContentChangedPayload, WriteContentOptions } from "./types.js";

export type { ContentChangedPayload, WriteContentOptions };

async function getFs() {
  return await import("node:fs/promises");
}

async function getPath() {
  return await import("node:path");
}

/**
 * Write a `CONTENT_CHANGED` payload to one or more JSON files on disk.
 *
 * @example
 * ```ts
 * import { writeContentToFiles } from "visual-editor-sdk/server";
 *
 * // Inside an API route or WebSocket handler:
 * await writeContentToFiles({
 *   data: { "home.hero.title": "Hello", "home.hero.description": "World" },
 *   dataFiles: ["content/home.json", "content/backup.json"]
 * });
 * ```
 */
export async function writeContentToFiles(
  payload: ContentChangedPayload,
  options: WriteContentOptions = {}
): Promise<void> {
  const { data, dataFiles } = payload;

  if (!dataFiles || dataFiles.length === 0) {
    throw new Error("writeContentToFiles: dataFiles array is empty or missing.");
  }

  if (!data || typeof data !== "object") {
    throw new Error("writeContentToFiles: data must be a non-null object.");
  }

  const { readFile, writeFile, mkdir } = await getFs();
  const { dirname } = await getPath();

  const merge = options.merge ?? true;
  const indent = options.indent ?? 2;

  const results = await Promise.allSettled(
    dataFiles.map(async (filePath) => {
      // Ensure the directory exists
      await mkdir(dirname(filePath), { recursive: true });

      let existing: Record<string, unknown> = {};

      if (merge) {
        try {
          const raw = await readFile(filePath, "utf-8");
          const parsed: unknown = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            existing = parsed as Record<string, unknown>;
          }
        } catch {
          // File does not exist or is not valid JSON — start fresh.
        }
      }

      let finalData: Record<string, unknown> = { ...existing, ...data };

      if (options.transform) {
        finalData = options.transform(
          finalData as Record<string, string>,
          filePath
        );
      }

      await writeFile(filePath, JSON.stringify(finalData, null, indent) + "\n", "utf-8");
    })
  );

  // Collect and report failures.
  const failures = results
    .map((r, i) => (r.status === "rejected" ? { file: dataFiles[i], reason: r.reason } : null))
    .filter(Boolean) as { file: string; reason: unknown }[];

  if (failures.length > 0) {
    const details = failures
      .map((f) => `  ${f.file}: ${f.reason instanceof Error ? f.reason.message : String(f.reason)}`)
      .join("\n");
    throw new Error(`writeContentToFiles: failed to write ${failures.length} file(s):\n${details}`);
  }
}

/**
 * Create an Express/Connect-compatible middleware handler for `CONTENT_CHANGED` requests.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { createContentChangedHandler } from "visual-editor-sdk/server";
 *
 * const app = express();
 * app.use(express.json());
 * app.post("/api/content-changed", createContentChangedHandler());
 * ```
 */
export function createContentChangedHandler(options: WriteContentOptions = {}) {
  return async (
    req: { body: ContentChangedPayload },
    res: { status: (code: number) => { json: (body: Record<string, unknown>) => void } }
  ) => {
    try {
      await writeContentToFiles(req.body, options);
      res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ ok: false, error: message });
    }
  };
}
