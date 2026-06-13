/**
 * Landing-page copy. Grounded ONLY in shipped capabilities per the ARY-17 plan
 * (§3 positioning, §10 guardrails). Do NOT add security claims beyond what the
 * code supports (no encryption-at-rest / "bank-grade" / SOC 2 until shipped).
 *
 * Trust-page (/security, /privacy) and blog copy come from the CMO (C1/C2) and
 * live in their own files — this is the marketing landing surface only.
 */
import { BRAND } from './brand';

export const HERO = {
  eyebrow: 'Private family asset vault',
  title: 'Everything your family owns, in one private place.',
  subtitle:
    "Inventory your assets, store the documents that prove them, and see your net worth at a glance. When a big life moment comes, get clear AI guidance — and a clean handoff to your advisor.",
  primaryCta: 'Join the waitlist',
  secondaryCta: 'See how it works',
  reassurance: 'Free to join · Private by design · No card required',
};

export const PILLARS = [
  {
    icon: 'layers',
    title: 'One source of truth',
    body:
      'Assets, liabilities, documents and net worth in a single private vault. Group everything into collections and track value over time.',
    proof: 'Dashboard · collections · net-worth history',
  },
  {
    icon: 'camera',
    title: 'Effortless capture',
    body:
      'Snap a photo on your phone and AI does the data entry — drafting asset records you confirm, edit, or reject. Quick "sprints" make a whole room fast.',
    proof: 'Live camera & document scanner · AI draft review',
  },
  {
    icon: 'compass',
    title: "Ready for life's big events",
    body:
      'A free AI overview of what is at stake — wills, inheritance, tax, divorce, business succession and more — then a clean snapshot you can share with a professional.',
    proof: 'AI advisory across 8+ life events · advisor referral packages',
  },
];

export const CAPTURE_DEMO = {
  title: 'Snap a photo. We do the paperwork.',
  body:
    'Point your camera at a room, a receipt, or a document. The AI reads it and drafts a structured record — value, location, condition, serial number — that you review in seconds. No spreadsheets, no manual entry.',
  steps: [
    { n: '01', label: 'Capture', text: 'Photograph an item or document with the in-app scanner.' },
    { n: '02', label: 'AI drafts', text: 'AI extracts the details and proposes a ready-to-save record.' },
    { n: '03', label: 'Confirm', text: 'You approve, tweak, or reject — you stay in control of your data.' },
  ],
};

export const ADVISORY = {
  eyebrow: 'AI life-event advisory',
  title: 'Guidance before life forces the question.',
  body:
    'Most families cannot answer a simple question: what do we own, and where is the proof? Once your vault is in place, get a free AI overview of what to do for the moments that matter — with estimate ranges, key risks, and recommended next steps.',
  channels: [
    'Will planning',
    'Inheritance',
    'Inheritance tax',
    'Divorce & separation',
    'Prenup',
    'Family-business succession',
    'Insurance',
    'Tax efficiency',
  ],
  footnote: 'Educational guidance, not legal or financial advice. Hand a clean snapshot to your own professional when you are ready.',
};

/** Trust strip — ONLY shipped, code-grounded claims (ARY-17 §3 trust narrative + §10). */
export const TRUST = {
  title: 'Private by design.',
  points: [
    { title: 'Your data is isolated to you', text: 'Per-user isolation is enforced on every request — nobody else can see your vault.' },
    { title: 'Sharing is consent-based & revocable', text: 'You choose exactly what to share with a professional, and you can revoke access anytime.' },
    { title: 'We keep an audit trail', text: 'Consent and access events are recorded, so you can see what happened with your data.' },
    { title: "We don't sell your data", text: 'Your family information is yours. It is never sold.' },
  ],
  link: { label: 'Read our security overview', href: '/security/' },
};

export const WAITLIST = {
  title: `Be first into ${BRAND.shortName}.`,
  body: 'Join the waitlist for early access to the closed beta. We will email you when your invite is ready — no spam, unsubscribe anytime.',
  cta: 'Join the waitlist',
  success: "You're on the list. We'll be in touch when your invite is ready.",
  placeholder: 'you@example.com',
};
