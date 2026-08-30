import 'server-only';

import { ImageResponse } from 'next/og';

import { loadFonts } from './fonts';
import { TEMPLATES, type AssetInput, type TemplateKind } from './templates';
import { canvas, TEMPLATE_VERSION } from './tokens';

/**
 * Renders an asset to PNG.
 *
 * Uses `next/og`, which bundles satori and resvg. Deliberately not a headless
 * browser: this runs per request in a serverless function, and it must be
 * deterministic. No new dependency either — this project's builds were broken
 * once already by a floating one.
 */

const KIND_TO_CANVAS: Record<TemplateKind, keyof typeof canvas> = {
  cover: 'cover',
  social: 'social',
  worksheet: 'worksheet',
};

export type RenderResult = {
  png: Uint8Array;
  contentType: 'image/png';
  width: number;
  height: number;
  templateVersion: string;
};

export async function renderAsset(
  kind: TemplateKind,
  input: AssetInput,
): Promise<RenderResult> {
  const fonts = await loadFonts();
  const size = canvas[KIND_TO_CANVAS[kind]];
  const Template = TEMPLATES[kind];

  const response = new ImageResponse(Template(input), {
    width: size.width,
    height: size.height,
    fonts: fonts.map((f) => ({
      name: f.name,
      data: f.data,
      weight: f.weight,
      style: f.style,
    })),
  });

  const png = new Uint8Array(await response.arrayBuffer());

  return {
    png,
    contentType: 'image/png',
    width: size.width,
    height: size.height,
    templateVersion: TEMPLATE_VERSION,
  };
}
