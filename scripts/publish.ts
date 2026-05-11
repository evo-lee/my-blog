#!/usr/bin/env node
/**
 * Lee's Blog CLI — Publish articles from local Markdown files
 *
 * Usage:
 *   npx tsx scripts/publish.ts ./article.md
 *   npx tsx scripts/publish.ts ./article.md --server=https://myblog.com --api-key=xxx
 *
 * Config file (~/.leeblog.json):
 *   {
 *     "server": "https://myblog.com",
 *     "apiKey": "your-api-key-here"
 *   }
 */

import fs from "fs";
import path from "path";
import os from "os";

interface Config {
  server: string;
  apiKey: string;
}

type FetchLike = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response> | Response;

interface Frontmatter {
  slug?: string;
  title?: string;
  category?: string;
  excerpt?: string;
  date?: string;
  cover?: string;
  [key: string]: unknown;
}

interface PublishOptions {
  file: string;
  server: string;
  apiKey: string;
  fetchImpl?: FetchLike;
  log?: Pick<Console, "log" | "error">;
}

function loadConfig(): Partial<Config> {
  const configPath = path.join(os.homedir(), ".leeblog.json");
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function parseArgs(): { file: string; server: string; apiKey: string } {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const server =
    args.find((a) => a.startsWith("--server="))?.replace("--server=", "") ||
    loadConfig().server ||
    "";
  const apiKey =
    args.find((a) => a.startsWith("--api-key="))?.replace("--api-key=", "") ||
    loadConfig().apiKey ||
    process.env.LEEBLOG_API_KEY ||
    "";

  if (!file) {
    console.error("Usage: npx tsx scripts/publish.ts <file.md> [--server=URL] [--api-key=KEY]");
    process.exit(1);
  }

  return { file, server, apiKey };
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const yaml = match[1];
  const body = match[2].trim();
  const frontmatter: Frontmatter = {};

  for (const line of yaml.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, "");
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 50);
}

function formatDate(date?: string): string {
  if (!date) {
    const now = new Date();
    return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  }
  // Convert 2026-05-05 to 2026.05.05
  return date.replace(/-/g, ".");
}

export async function publishFromFile({
  file,
  server,
  apiKey,
  fetchImpl = fetch,
  log = console,
}: PublishOptions) {

  if (!server) {
    throw new Error("--server is required (or set in ~/.leeblog.json)");
  }
  if (!apiKey) {
    throw new Error("--api-key is required (or set in ~/.leeblog.json or LEEBLOG_API_KEY env)");
  }

  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  const raw = fs.readFileSync(file, "utf-8");
  const { frontmatter, body } = parseFrontmatter(raw);

  const title = frontmatter.title || path.basename(file, ".md").replace(/-/g, " ");
  const slug = frontmatter.slug || slugify(title);
  const category = frontmatter.category || "LITERATURE";
  const excerpt = frontmatter.excerpt || "";
  const publishedDate = formatDate(frontmatter.date);
  const coverImage = frontmatter.cover || "";

  // Split body into paragraphs (double newline = new paragraph)
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) {
    throw new Error("Article has no content paragraphs");
  }

  log.log(`Publishing: ${title}`);
  log.log(`Slug: ${slug}`);
  log.log(`Paragraphs: ${paragraphs.length}`);

  const publishUrl = server.replace(/\/$/, "") + "/api/publish";

  try {
    const response = await fetchImpl(publishUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        slug,
        title,
        excerpt,
        content: paragraphs,
        category,
        coverImage,
        publishedDate,
      }),
    });

    const result = (await response.json()) as {
      id?: number;
      slug?: string;
      url?: string;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${result.error || "Unknown error"}`);
    }

    log.log(`\n✅ Published successfully!`);
    log.log(`URL: ${server}/article/${slug}`);
    log.log(`ID: ${result.id}`);
    return result as { id: number; slug: string; url: string };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${message}\nMake sure the server is running at ${server}`);
  }
}

async function main() {
  try {
    await publishFromFile(parseArgs());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
