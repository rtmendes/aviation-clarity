import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Font loading for the asset renderer.
 *
 * satori has no system fonts — every face has to be handed to it as a buffer.
 * The files are vendored in the repository rather than fetched at render time
 * for two reasons: a render that depends on a network call can fail in
 * production for reasons nothing to do with the content, and identical input
 * must produce identical bytes, which a remotely-fetched font cannot promise.
 *
 * Both families are SIL Open Font Licence, so redistribution is permitted.
 */

export type LoadedFont = {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700;
  style: 'normal';
};

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');

const FILES = [
  { file: 'BarlowSemiCondensed-SemiBold.ttf', name: 'Barlow Semi Condensed', weight: 600 },
  { file: 'BarlowSemiCondensed-Bold.ttf', name: 'Barlow Semi Condensed', weight: 700 },
  { file: 'Inter-Regular.ttf', name: 'Inter', weight: 400 },
  { file: 'Inter-SemiBold.ttf', name: 'Inter', weight: 600 },
] as const;

let cached: LoadedFont[] | null = null;

/** Read once per process; a render should not pay disk I/O every request. */
export async function loadFonts(): Promise<LoadedFont[]> {
  if (cached) return cached;

  cached = await Promise.all(
    FILES.map(async (f) => ({
      name: f.name,
      data: await readFile(join(FONT_DIR, f.file)),
      weight: f.weight as LoadedFont['weight'],
      style: 'normal' as const,
    })),
  );

  return cached;
}
