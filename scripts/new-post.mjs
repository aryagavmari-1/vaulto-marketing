#!/usr/bin/env node
/**
 * Content scaffolder for the publishing pipeline (ARY-403).
 *
 * A content sub-agent runs:
 *   node scripts/new-post.mjs "How to value a family heirloom"
 * and gets a ready-to-edit Markdown file at src/content/blog/<slug>.md with
 * correct, schema-valid frontmatter. This is the *only* place posts are born,
 * so frontmatter never drifts from the content collection schema.
 *
 * Safe write-boundary: writes solely under src/content/blog/. It never touches
 * config, layouts, or infra — see PUBLISHING.md for the content sub-agent contract.
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const title = process.argv.slice(2).join(' ').trim();
if (!title) {
  console.error('Usage: node scripts/new-post.mjs "Your post title"');
  process.exit(1);
}

const slug = title
  .toLowerCase()
  .replace(/['’"]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src', 'content', 'blog');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const file = join(dir, `${slug}.md`);
if (existsSync(file)) {
  console.error(`Refusing to overwrite existing post: ${file}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const body = `---
title: "${title.replace(/"/g, '\\"')}"
description: "TODO 150-160 char meta description — the search snippet. Lead with the reader's question and Vaulto's plain-English answer."
pubDate: ${today}
draft: true
placeholder: false
---

## TODO — replace this outline with the cornerstone article.

Open with the reader's problem in one or two sentences, then the practical answer.

### Key points to cover

- Point one
- Point two
- Point three

> Vaulto helps you keep every asset, value, and document in one private place —
> [join the waitlist](/#waitlist).

_This guide is informational and does not replace professional advice._
`;

writeFileSync(file, body);
console.log(`Created ${file}`);
console.log('Next: write the content, set draft: false, commit & push — deploy is automatic.');
