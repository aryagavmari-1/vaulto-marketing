// ARY-451 — strip emoji from Home content across every locale and replace the
// per-card icon strings with semantic icon names (rendered via Icon.astro).
// Idempotent: safe to re-run.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'content', 'home');
// Leading emoji (pictographic) + variation selectors + following spaces.
const leadingEmoji = /^[\p{Extended_Pictographic}\u{FE0F}\u{200D}←-⇿⌀-➿⬀-⯿]+\s*/u;
const HERO_ICONS = ['home', 'document', 'chart'];
const VALUE_ICONS = ['folders', 'shield', 'compass'];

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const path = join(dir, file);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.hero?.eyebrow) data.hero.eyebrow = data.hero.eyebrow.replace(leadingEmoji, '');
  if (data.hero?.art?.lock) data.hero.art.lock = data.hero.art.lock.replace(leadingEmoji, '');
  data.hero?.art?.cards?.forEach((c, i) => { c.icon = HERO_ICONS[i] ?? 'check'; });
  data.value?.cards?.forEach((c, i) => { c.icon = VALUE_ICONS[i] ?? 'check'; });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  console.log('updated', file);
}
