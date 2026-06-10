export interface NavItem {
  label: string;
  url: string;
}

export interface SitemapItem {
  pageName: string;
  url: string;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface GlobalSettings {
  siteName: string;
  logoUrl: string;
  nav: {
    style: string;
    items: NavItem[];
  };
  sitemap: SitemapItem[];
  footer: {
    style: string;
    copyright: string;
    socials: SocialLink[];
  };
  responsive: string;
  imageInstructions: string;
  globalCustomInstructions: string;
}

export interface CopyFields {
  headline: string;
  subheadline: string;
  body: string;
  cta_text: string;
  cta_url: string;
}

export interface SectionItem {
  title: string;
  description: string;
  icon: string;
  image: string;
  link: string;
}

export interface SectionImage {
  src: string;
  alt: string;
  width: string;
  height: string;
  position: string;
}

export interface LayoutContract {
  section_role: string;
  desktop_layout: string;
  mobile_layout: string;
  column_structure: string;
  content_position: string;
  image_position: string;
  card_or_grid_structure: string;
  alignment_rules: string;
  spacing_density: string;
  must_preserve: string;
  allowed_simplifications: string;
  do_not_do: string;
}

export const DEFAULT_LAYOUT_CONTRACT: LayoutContract = {
  section_role: '',
  desktop_layout: '',
  mobile_layout: '',
  column_structure: '',
  content_position: '',
  image_position: '',
  card_or_grid_structure: '',
  alignment_rules: '',
  spacing_density: '',
  must_preserve: '',
  allowed_simplifications: '',
  do_not_do: '',
};

export function normalizeLayoutContract(value: unknown): LayoutContract {
  // Already a proper object — merge missing keys with defaults
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return { ...DEFAULT_LAYOUT_CONTRACT, ...(value as Partial<LayoutContract>) };
  }

  // null / undefined / non-string → default
  if (typeof value !== 'string') {
    return { ...DEFAULT_LAYOUT_CONTRACT };
  }

  const trimmed = value.trim();

  // Empty string or bare empty object string → default
  if (!trimmed || trimmed === '{}') {
    return { ...DEFAULT_LAYOUT_CONTRACT };
  }

  // Try to parse as JSON
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...DEFAULT_LAYOUT_CONTRACT, ...(parsed as Partial<LayoutContract>) };
      }
    } catch {
      // fall through to plain-text handling
    }
  }

  // Old plain-text layout_contract (free-form description written before the
  // structured interface existed). Preserve the text in the two most useful
  // fields so the user can see it and redistribute manually.
  return {
    ...DEFAULT_LAYOUT_CONTRACT,
    desktop_layout: trimmed,
    must_preserve: trimmed,
  };
}

export interface Section {
  id: string;
  page_id: string;
  section_name: string;
  section_type: string;
  background_hex: string;
  headline_size: string;
  layout_variant: string;
  layout_description: string;
  layout_contract: LayoutContract;
  copy: CopyFields;
  items: SectionItem[];
  images: SectionImage[];
  notes: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Page {
  id: string;
  project_id: string;
  page_name: string;
  slug: string;
  purpose: string;
  primary_cta: string;
  seo_title: string;
  seo_description: string;
  screenshot_url: string;
  sort_order: number;
  custom_instructions: string;
  page_url: string;
  generated_html: string;
  created_at: string;
  updated_at: string;
  sections?: Section[];
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  url: string;
  globals: GlobalSettings;
  design_md: string;
  screenshot_url: string;
  created_at: string;
  updated_at: string;
  pages?: Page[];
}

export type AIProvider = 'anthropic' | 'openai';

export interface AppSettings {
  firecrawlApiKey: string;
  anthropicApiKey: string;
  openaiApiKey: string;
  aiProvider: AIProvider;
  defaultImageInstructions: string;
}

export const SECTION_TYPES = [
  'Hero (Split)',
  'Hero (Centered)',
  'Features Grid',
  'CTA Banner',
  'Testimonials',
  'FAQ',
  'Team',
  'Pricing',
  'Contact',
  'Stats',
  'Logo Bar',
  'Gallery',
  'Content (50/50)',
  'Content (Full)',
  'Nav',
  'Footer',
  'Custom',
] as const;

export type SectionType = typeof SECTION_TYPES[number];

export const DEFAULT_GLOBALS: GlobalSettings = {
  siteName: '',
  logoUrl: '',
  nav: { style: '', items: [] },
  sitemap: [],
  footer: { style: '', copyright: '', socials: [] },
  responsive: '',
  imageInstructions: 'Use https://placehold.co/[width]x[height]/[bg-hex]/[text-hex] for missing images.',
  globalCustomInstructions: '',
};

export const DEFAULT_COPY: CopyFields = {
  headline: '',
  subheadline: '',
  body: '',
  cta_text: '',
  cta_url: '',
};

export const SECTION_TEMPLATES: Record<string, Partial<Section>> = {
  'Hero (Split)': {
    section_type: 'Hero (Split)',
    background_hex: '#ffffff',
    headline_size: '64px',
    layout_variant: '2-col image-right',
    layout_description: 'Full-width section. Left half: vertically centered content block. Large H1 headline, subheadline below (18px, gray), then CTA button row. Right half: full-height image, object-fit cover. On mobile: image stacks below text, full width.',
    copy: { headline: 'Your Compelling Headline Here', subheadline: 'Supporting subheadline that explains the value proposition clearly.', body: '', cta_text: 'Get Started', cta_url: '#' },
  },
  'Hero (Centered)': {
    section_type: 'Hero (Centered)',
    background_hex: '#0f172a',
    headline_size: '80px',
    layout_variant: 'full-width centered',
    layout_description: 'Full-width section with centered content. Background gradient or solid color. Centered label/eyebrow text (12px uppercase letter-spaced). Large centered H1 headline. Centered subheadline below (20px). Button row centered below. Optional background image or video with overlay.',
    copy: { headline: 'Build Something Amazing', subheadline: 'The platform that helps teams move faster.', body: '', cta_text: 'Start Free', cta_url: '#' },
  },
  'Features Grid': {
    section_type: 'Features Grid',
    background_hex: '#f8fafc',
    headline_size: '48px',
    layout_variant: '3-col grid',
    layout_description: 'Section with centered headline + subheadline at top. Below: 3-column card grid (32px gap). Each card: icon (48px, accent color) at top, bold title (20px), description text (16px, gray, 1.6 line-height). Cards have white background, subtle border, 12px border-radius, 32px padding. On mobile: single column.',
    copy: { headline: 'Everything you need', subheadline: 'Powerful features to accelerate your workflow.', body: '', cta_text: '', cta_url: '' },
    items: [
      { title: 'Feature One', description: 'Description of this key feature and why it matters to users.', icon: '', image: '', link: '' },
      { title: 'Feature Two', description: 'Description of this key feature and why it matters to users.', icon: '', image: '', link: '' },
      { title: 'Feature Three', description: 'Description of this key feature and why it matters to users.', icon: '', image: '', link: '' },
    ],
  },
  'CTA Banner': {
    section_type: 'CTA Banner',
    background_hex: '#0ea5e9',
    headline_size: '48px',
    layout_variant: 'full-width centered',
    layout_description: 'Full-width colored banner. Centered headline (white, 48px). Subheadline below (white, 20px, 70% opacity). CTA button(s) centered below — primary white button + optional secondary ghost button. Generous vertical padding (96px top/bottom).',
    copy: { headline: 'Ready to get started?', subheadline: 'Join thousands of teams already using the platform.', body: '', cta_text: 'Start Free Trial', cta_url: '#' },
  },
  'Testimonials': {
    section_type: 'Testimonials',
    background_hex: '#ffffff',
    headline_size: '48px',
    layout_variant: '3-col grid',
    layout_description: 'Section header centered at top (headline + subheadline). Below: 3-column testimonial card grid. Each card: large quote mark (64px, accent), quote text (18px, gray, italic), then avatar + name + title row at bottom. Cards: white bg, subtle shadow, 12px radius, 32px padding. On mobile: single column stack.',
    copy: { headline: 'Trusted by teams worldwide', subheadline: 'See what our customers are saying.', body: '', cta_text: '', cta_url: '' },
    items: [
      { title: 'Jane Smith, CEO at Acme', description: '"This product completely transformed how our team works. We moved 3x faster immediately."', icon: '', image: '', link: '' },
      { title: 'John Doe, CTO at Startup', description: '"The quality of output is incredible. Our clients love the results."', icon: '', image: '', link: '' },
      { title: 'Sarah Lee, Designer', description: '"I can\'t imagine going back to the old workflow. This is now essential."', icon: '', image: '', link: '' },
    ],
  },
  'FAQ': {
    section_type: 'FAQ',
    background_hex: '#f8fafc',
    headline_size: '48px',
    layout_variant: 'single-col accordion',
    layout_description: 'Centered section header at top. Below: single-column accordion list, max-width 720px, centered. Each item: question row with chevron icon right, answer text revealed on expand. Subtle border between items. On click: smooth expand animation, chevron rotates 180deg.',
    copy: { headline: 'Frequently asked questions', subheadline: 'Everything you need to know.', body: '', cta_text: '', cta_url: '' },
    items: [
      { title: 'How does it work?', description: 'Answer to this frequently asked question goes here.', icon: '', image: '', link: '' },
      { title: 'What is included?', description: 'Answer to this frequently asked question goes here.', icon: '', image: '', link: '' },
      { title: 'How do I get started?', description: 'Answer to this frequently asked question goes here.', icon: '', image: '', link: '' },
    ],
  },
  'Stats': {
    section_type: 'Stats',
    background_hex: '#0f172a',
    headline_size: '64px',
    layout_variant: '4-col stats row',
    layout_description: 'Full-width section with dark background. 4-column row of stat blocks, evenly spaced. Each: large number (64px, white, bold), label below (16px, gray). Optional centered headline above the stat row. Vertical dividers between stats on desktop. On mobile: 2x2 grid.',
    copy: { headline: '', subheadline: '', body: '', cta_text: '', cta_url: '' },
    items: [
      { title: '10,000+', description: 'Active users', icon: '', image: '', link: '' },
      { title: '99.9%', description: 'Uptime SLA', icon: '', image: '', link: '' },
      { title: '50ms', description: 'Average response', icon: '', image: '', link: '' },
      { title: '4.9/5', description: 'Customer rating', icon: '', image: '', link: '' },
    ],
  },
  'Logo Bar': {
    section_type: 'Logo Bar',
    background_hex: '#ffffff',
    headline_size: '14px',
    layout_variant: 'horizontal logo row',
    layout_description: 'Narrow section with centered label text ("TRUSTED BY" or similar, 12px uppercase, letter-spaced, gray). Below: horizontal row of company logos, grayscale, evenly spaced, vertically centered. On mobile: wrap to 2 rows, 3 logos per row.',
    copy: { headline: 'Trusted by industry leaders', subheadline: '', body: '', cta_text: '', cta_url: '' },
    items: [],
  },
  'Content (50/50)': {
    section_type: 'Content (50/50)',
    background_hex: '#ffffff',
    headline_size: '48px',
    layout_variant: '2-col text-left image-right',
    layout_description: 'Two-column section, 50/50 split. Left: vertically centered content — eyebrow label (12px, accent, uppercase), H2 headline (48px), body paragraphs (16px, gray, 1.7 line-height), optional CTA link. Right: image with subtle shadow and border-radius. On mobile: image stacks below text.',
    copy: { headline: 'Section headline here', subheadline: '', body: 'Supporting body copy that explains this section in more detail. Can be 2-3 sentences.', cta_text: 'Learn more', cta_url: '#' },
  },
  'Pricing': {
    section_type: 'Pricing',
    background_hex: '#f8fafc',
    headline_size: '48px',
    layout_variant: '3-col pricing cards',
    layout_description: 'Centered section header. Below: 3-column pricing card grid. Each card: plan name (14px, uppercase), price (64px, bold), billing period, feature list (checkmarks), CTA button at bottom. Middle/featured card: accent background, slightly larger, elevated shadow. On mobile: single column.',
    copy: { headline: 'Simple, transparent pricing', subheadline: 'No hidden fees. Cancel anytime.', body: '', cta_text: '', cta_url: '' },
    items: [
      { title: 'Starter', description: '$29/month\n- Feature one\n- Feature two\n- Feature three', icon: '', image: '', link: '' },
      { title: 'Pro', description: '$79/month\n- Everything in Starter\n- Feature four\n- Feature five', icon: '', image: '', link: '' },
      { title: 'Enterprise', description: 'Custom pricing\n- Everything in Pro\n- Dedicated support\n- SLA guarantee', icon: '', image: '', link: '' },
    ],
  },
};
