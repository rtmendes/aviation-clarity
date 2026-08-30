/**
 * Aviation Clarity design tokens — the single source of truth.
 *
 * The palette is the one already shipping in app/globals.css, formalised
 * rather than replaced: a deep navy ground with pale blue text, which reads as
 * night instrument lighting. What it was missing is an accent and a way to
 * show review state, both added here.
 *
 * Every rendered asset and the application UI read these same values.
 * `scripts/verify-tokens.mjs` fails the build if globals.css drifts from them.
 */

export const palette = {
  /** Deep navy ground, from the existing globals.css. */
  ground: '#07111f',
  /** Raised surface — cards, panels. */
  surface: '#0b1a2b',
  /** Hairline borders. */
  border: '#1d3045',
  /** Primary text on the dark ground. */
  ink: '#edf4ff',
  /** Secondary text. */
  inkMuted: '#9fb4c9',

  /**
   * Accent. Clear-sky cyan: the brand is called Clarity, and cyan carries no
   * cockpit meaning — unlike amber and red, which annunciate caution and
   * warning. Using either as decoration in a safety product would be careless.
   */
  accent: '#5cc5f0',
  /** Accent for light grounds, where the bright cyan fails contrast. */
  accentDeep: '#1c6e91',

  /** Print/worksheet ground. Worksheets get photocopied; they must be light. */
  paper: '#f7f9fb',
  paperInk: '#0d1826',
  paperMuted: '#5a6a7d',
  paperRule: '#d5dde5',
} as const;

/**
 * Review state, carried through to the artwork.
 *
 * These are not decorative. An asset rendered from content a qualified human
 * has not approved must not look publishable, so state is part of the design.
 */
export const reviewState = {
  approved: { color: '#3fa37a', label: 'REVIEWED & APPROVED' },
  review: { color: '#c9902f', label: 'DRAFT — AWAITING REVIEW' },
  draft: { color: '#c9902f', label: 'DRAFT — NOT REVIEWED' },
  blocked: { color: '#c4564c', label: 'BLOCKED — DO NOT PUBLISH' },
} as const;

export type ReviewStateKey = keyof typeof reviewState;

export const type = {
  /**
   * Condensed grotesque for display. Aviation titles run long — "Airspace
   * classes without memorizing a maze" — and a condensed face sets them at a
   * usable size without shrinking to nothing.
   */
  display: 'Barlow Semi Condensed',
  /** Body face for anything meant to be read rather than scanned. */
  body: 'Inter',
} as const;

/** A 1.25 scale, rounded to whole pixels so text lands on the pixel grid. */
export const scale = {
  xs: 14,
  sm: 18,
  base: 22,
  md: 28,
  lg: 35,
  xl: 44,
  xxl: 55,
  display: 69,
  hero: 86,
} as const;

export const space = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
  xxl: 96,
} as const;

/** Canvas sizes. Fixed so an asset's dimensions are a property of its kind. */
export const canvas = {
  /** 1.6:1 trade paperback proportion, at print-usable density. */
  cover: { width: 1200, height: 1920 },
  /** Open Graph / social. */
  social: { width: 1200, height: 630 },
  /** US Letter at 150dpi — the format a flight school actually prints. */
  worksheet: { width: 1275, height: 1650 },
} as const;

export type CanvasKind = keyof typeof canvas;

/**
 * Bumped whenever a template's visual output changes.
 *
 * Recorded against every rendered asset. Without it there is no way to tell
 * which assets predate a design change, and so no way to decide what needs
 * re-rendering — the same reasoning as PROMPT_VERSION for generated text.
 */
export const TEMPLATE_VERSION = '2026-08-30.1';
