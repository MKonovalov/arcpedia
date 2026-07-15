import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

// Docs live in the repo's top-level `docs/` directory (markdown). This route
// renders them inside the app shell so they deploy to the same Cloudflare
// Pages project (`arcpedia`) as the rest of the app — no separate site.
const DOCS_ROOT = path.join(process.cwd(), "docs");

interface DocsPageProps {
  params: Promise<{ slug?: string[] }>;
}

/** Resolve a slug path (from `[[...slug]]`) to a real markdown file under docs/. */
async function resolveDoc(slug: string[] | undefined): Promise<string | null> {
  // Index: /docs
  if (!slug || slug.length === 0) return null;
  const rel = slug.join("/");
  for (const candidate of [`${rel}.md`, path.join(rel, "index.md")]) {
    try {
      const full = path.join(DOCS_ROOT, candidate);
      // Guard against path traversal escaping docs/.
      if (!path.resolve(full).startsWith(path.resolve(DOCS_ROOT))) return null;
      const stat = await fs.stat(full);
      if (stat.isFile()) return full;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** Render a simple list of available docs when visiting /docs with no slug. */
async function listDocs(): Promise<{ href: string; title: string }[]> {
  const entries: { href: string; title: string }[] = [];
  try {
    const walk = async (dir: string, prefix: string) => {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const abs = path.join(dir, item.name);
        if (item.isDirectory()) {
          if (item.name === "assets") continue; // image assets, not docs
          await walk(abs, path.join(prefix, item.name));
        } else if (item.isFile() && item.name.endsWith(".md")) {
          const rel = path
            .relative(DOCS_ROOT, abs)
            .replace(/\\/g, "/")
            .replace(/\.md$/, "")
            .replace(/index$/, "");
          const raw = await fs.readFile(abs, "utf8");
          const title =
            raw.match(/^#\s+(.+)$/m)?.[1]?.trim() || rel || "Docs index";
          entries.push({ href: `/docs/${rel}`, title });
        }
      }
    };
    await walk(DOCS_ROOT, "");
  } catch {
    // docs/ missing — return empty list, the index will show a friendly note.
  }
  return entries;
}

export async function generateMetadata({
  params,
}: DocsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const file = await resolveDoc(slug);
  if (!file) {
    return { title: { absolute: "Docs · arcpedia" } };
  }
  const raw = await fs.readFile(file, "utf8");
  const title = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Docs";
  return { title: { absolute: `${title} · arcpedia` } };
}

export default async function DocsPage({ params }: DocsPageProps) {
  const { slug } = await params;
  const file = await resolveDoc(slug);

  if (!file) {
    const docs = await listDocs();
    return (
      <div className="shell" style={{ paddingTop: 72, paddingBottom: 80, maxWidth: 760 }}>
        <p className="fmark" style={{ marginBottom: 14 }}>
          documentation
        </p>
        <h1
          className="display"
          style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "0 0 18px" }}
        >
          arcpedia docs
        </h1>
        {docs.length === 0 ? (
          <p style={{ color: "var(--ink-2)", fontSize: 16.5, lineHeight: 1.7 }}>
            No docs published yet. Drop markdown into the repo&apos;s{" "}
            <code>docs/</code> directory and it will appear here.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {docs.map((d) => (
              <li key={d.href}>
                <Link
                  href={d.href}
                  style={{
                    display: "block",
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: "1px solid var(--rule)",
                    color: "var(--ink)",
                    textDecoration: "none",
                    fontSize: 16.5,
                  }}
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const raw = await fs.readFile(file, "utf8");
  return (
    <div className="shell" style={{ paddingTop: 64, paddingBottom: 80, maxWidth: 760 }}>
      <Link
        href="/docs"
        style={{ color: "var(--muted)", fontSize: 14, textDecoration: "none" }}
      >
        ← Docs
      </Link>
      <div style={{ marginTop: 18 }}>
        <MarkdownRenderer content={raw} />
      </div>
    </div>
  );
}
