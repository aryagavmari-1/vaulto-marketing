import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Blog cornerstone pages (CMO deliverable C2) live as Markdown in src/content/blog/.
// Drop a new .md file in with this frontmatter and it appears on /blog automatically.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    draft: z.boolean().default(false),
    // Marks template/seed content not yet supplied by CMO C2.
    placeholder: z.boolean().default(false),
  }),
});

export const collections = { blog };
