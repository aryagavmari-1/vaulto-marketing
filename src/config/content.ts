/**
 * Landing-page copy — verbatim from the CMO's approved deck (ARY-23 §2),
 * which is grounded 1:1 to shipped code (ARY-23 §0 traceability table) and
 * passes the §10 honesty guardrail. Do NOT add security claims beyond shipped
 * capabilities (no encryption-at-rest / "bank-grade" / SOC 2).
 */

export const HERO = {
  eyebrow: 'Private family asset vault',
  title: 'Everything your family owns, in one private place.',
  subtitle:
    'Vaulto turns scattered accounts, property, and documents into one clear picture of your net worth — and gets you ready for life’s big moments. Snap a photo; we do the data entry.',
  primaryCta: 'Join the waitlist',
  secondaryCta: 'See how it works ↓',
  reassurance: 'Private by design. Your data is isolated to you, and you control every share.',
};

export const PILLARS = [
  {
    icon: 'layers',
    title: 'One source of truth for what you own',
    body:
      'Record every asset and liability — value or value-range, where it is, whether it’s insured, condition, serial number, tags — and group it into collections. Watch your household net worth in one dashboard, with history over time. No more “which account was that in?”',
    proof: 'Inventory · collections · net-worth history',
  },
  {
    icon: 'camera',
    title: 'Snap a photo. We’ll do the data entry.',
    body:
      'Point your phone at a room, a receipt, or a document. AI reads it and drafts the record — you just confirm, edit, or skip. Capture sprints (“a room”, “20 things”, “your documents”) turn an overwhelming job into a few short sessions.',
    proof: 'Live camera & scanner · AI draft review queue',
  },
  {
    icon: 'compass',
    title: 'Be ready before life forces it',
    body:
      'Get a free AI overview of what’s at stake across 11 life-event topics — from will planning and inheritance to divorce, a prenup, family-business succession, insurance, and tax. Ask deeper questions, get a report of risks and recommended actions, then hand a clean snapshot to your solicitor or advisor.',
    proof: 'AI guidance is informational — it doesn’t replace your professional',
  },
];

export const CAPTURE_DEMO = {
  title: 'From a shoebox to a vault — in an afternoon',
  body: 'No spreadsheets. No marathon data-entry session.',
  steps: [
    { n: '01', label: 'Snap', text: 'Photograph items, receipts, or documents on your phone.' },
    { n: '02', label: 'Review', text: 'AI drafts the details; you confirm or tweak in seconds.' },
    { n: '03', label: 'See it add up', text: 'Each item updates your net worth and vault strength.' },
  ],
};

export const ADVISORY = {
  eyebrow: 'A free read on what to do next',
  title: 'Be ready before life forces it.',
  body:
    'Facing a will, an inheritance, or a separation? Answer a few questions and get an instant overview — the key risks and the actions worth taking — at no cost. Go deeper when you’re ready, and share a clean summary with the professional handling it.',
  // The verified 11 advisory channels (ARY-23 §0 — real names, do not invent).
  channels: [
    'Will planning',
    'Inheritance',
    'Inheritance tax',
    'Divorce & separation',
    'Prenup',
    'Family-business succession',
    'Insurance',
    'Tax efficiency',
    'Cross-border',
    'Financial overview',
    'Asset financing',
  ],
  cta: 'Try a free overview (closed beta)',
  footnote: 'Guidance is informational and helps you prepare — it doesn’t replace your professional.',
};

/** Trust strip — ARY-23 §2; each chip maps to shipped code. No overclaim. */
export const TRUST = {
  title: 'Built to be trusted with your most private records',
  points: [
    { title: 'Isolated to you', text: 'Your vault is scoped to your account on every request.' },
    { title: 'Consent-based sharing', text: 'Every share is granted by you and revocable anytime.' },
    { title: 'Audit trail', text: 'We keep a record of access and changes.' },
    { title: 'Protected sign-in', text: 'Passwords are scrypt-hashed, never stored in plain text.' },
  ],
  link: { label: 'How we protect your data', href: '/security/' },
};

export const WAITLIST = {
  title: 'Get early access',
  body:
    'Vaulto is in closed beta. Join the waitlist and we’ll invite you in — and help you capture your first assets in minutes.',
  cta: 'Join the waitlist',
  success: 'You’re on the list. We’ll email you when your invite is ready.',
  placeholder: 'Email address',
  reassurance: 'We’ll only email you about your invite. We don’t sell your data.',
};
