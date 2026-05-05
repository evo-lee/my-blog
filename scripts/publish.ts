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

interface Frontmatter {
  slug?: string;
  title?: string;
  category?: string;
  excerpt?: string;
  date?: string;
  cover?: string;
  [key: string]: any;
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

async function main() {
  const { file, server, apiKey } = parseArgs();

  if (!server) {
    console.error("Error: --server is required (or set in ~/.leeblog.json)");
    process.exit(1);
  }
  if (!apiKey) {
    console.error("Error: --api-key is required (or set in ~/.leeblog.json or LEEBLOG_API_KEY env)");
    process.exit(1);
  }

  if (!fs.existsSync(file)) {
    console.error(`Error: File not found: ${file}`);
    process.exit(1);
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
    console.error("Error: Article has no content paragraphs");
    process.exit(1);
  }

  console.log(`Publishing: ${title}`);
  console.log(`Slug: ${slug}`);
  console.log(`Paragraphs: ${paragraphs.length}`);

  const publishUrl = server.replace(/\/$/, "") + "/api/publish";

  try {
    const response = await fetch(publishUrl, {
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

    const result = await response.json();

    if (!response.ok) {
      console.error(`Error ${response.status}: ${result.error || "Unknown error"}`);
      process.exit(1);
    }

    console.log(`\n✅ Published successfully!`);
    console.log(`URL: ${server}/article/${slug}`);
    console.log(`ID: ${result.id}`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    console.error(`Make sure the server is running at ${server}`);
    process.exit(1);
  }
}

main();
