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
    // Optional FAQ Q&A pairs (ARY-470). When present, the post emits FAQPage
    // JSON-LD (in addition to BlogPosting) so its "Frequently asked questions"
    // block is eligible for the FAQ rich result. Mirror the on-page Q&As here.
    faqs: z
      .array(z.object({ question: z.string(), answer: z.string() }))
      .optional(),
  }),
});

export const collections = { blog };
