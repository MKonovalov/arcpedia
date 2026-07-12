#!/usr/bin/env -S npx tsx
/**
 * seed-arc-reference.mts — Seed the arc brand reference PNG into storage.
 *
 * The arc brand reference image (assets/arc-reference.png) is a *constant brand
 * asset*, not application code. It used to be baked into the server bundle as a
 * ~277 KB base64 string, inflating the Cloudflare Workers upload. It now lives
 * in storage and is read lazily at runtime by src/lib/illustration.ts via
 * getStorage().readAsset(rawRelPath("assets/arc-reference.png")).
 *
 * This script puts the PNG at that exact key so the reader finds it.
 *
 * Usage:
 *   # Local / dev (filesystem storage) — writes through the app's own storage
 *   # layer so the seed key always matches the read key:
 *   npx tsx scripts/seed-arc-reference.mts
 *
 *   # Production (Cloudflare R2) — uploads to the arcpedia-raw bucket at the
 *   # same logical key. Requires CLOUDFLARE_API_TOKEN / account, or `wrangler
 *   # login`. The R2 object key is `raw/assets/arc-reference.png` to match the
 *   R2StorageProvider's rawRelPath mapping.
 *   npx tsx scripts/seed-arc-reference.mts --r2
 *
 * Idempotent: re-running just overwrites the same object.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const PNG_PATH = path.join(PROJECT_ROOT, "assets", "arc-reference.png");
// Must equal rawRelPath("assets/arc-reference.png") for the default data dir
// (getDataDir() = cwd, getRawDir() = cwd/raw) so the runtime reader finds it.
const STORAGE_KEY = "raw/assets/arc-reference.png";
const R2_BUCKET = "arcpedia-raw";

async function main() {
  const useR2 = process.argv.includes("--r2");

  let png: Buffer;
  try {
    png = await readFile(PNG_PATH);
  } catch {
    console.error(`✗ arc reference PNG not found at ${PNG_PATH}`);
    console.error("  Run this from the project root, or restore assets/arc-reference.png.");
    process.exit(1);
  }
  console.log(`ℹ  arc reference PNG: ${png.length} bytes`);

  if (useR2) {
    // The app's R2StorageProvider reads via the `R2` binding; outside a Worker
    // we can't use that binding, so upload with wrangler instead. The object
    // key matches rawRelPath("assets/arc-reference.png").
    const res = spawnSync(
      "npx",
      [
        "--yes", "wrangler", "r2", "object", "put",
        `${R2_BUCKET}/${STORAGE_KEY}`,
        "--file", PNG_PATH,
        "--remote",
      ],
      { stdio: "inherit", cwd: PROJECT_ROOT },
    );
    if (res.status !== 0) {
      console.error("✗ wrangler r2 object put failed");
      process.exit(res.status ?? 1);
    }
    console.log(`✓ seeded arc reference into R2: ${R2_BUCKET}/${STORAGE_KEY}`);
    return;
  }

  // Local / dev: write through the application's own storage layer so the key
  // mapping is guaranteed identical to what the runtime reader expects.
  const { getStorage } = await import("../src/lib/storage/index.ts");
  const { rawRelPath } = await import("../src/lib/wiki.ts");
  const storage = getStorage();
  const ab = new ArrayBuffer(png.byteLength);
  new Uint8Array(ab).set(
    new Uint8Array(png.buffer, png.byteOffset, png.byteLength),
  );
  await storage.writeAsset(rawRelPath("assets/arc-reference.png"), ab);
  console.log(`✓ seeded arc reference into local storage at: ${rawRelPath("assets/arc-reference.png")}`);
}

main().catch((err) => {
  console.error("✗ seed failed:", err);
  process.exit(1);
});
