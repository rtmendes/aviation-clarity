/**
 * Fails if app/globals.css has drifted from lib/design/tokens.ts.
 *
 * The page and every rendered asset are supposed to be the same brand. Two
 * copies of a palette diverge silently — one gets tweaked, the other does not,
 * and a cover stops matching the site it is sold on.
 */
import { readFileSync } from 'node:fs';

const tokens = readFileSync('lib/design/tokens.ts', 'utf8');
const css = readFileSync('app/globals.css', 'utf8');

const pairs = [
  ['ground', '--ground'],
  ['surface', '--surface'],
  ['border', '--border'],
  ['ink', '--ink'],
  ['inkMuted', '--ink-muted'],
  ['accent', '--accent'],
];

let failed = 0;

for (const [tsKey, cssVar] of pairs) {
  const tsMatch = new RegExp(`${tsKey}:\\s*'(#[0-9a-f]{6})'`, 'i').exec(tokens);
  const cssMatch = new RegExp(`${cssVar}:\\s*(#[0-9a-f]{6})`, 'i').exec(css);

  if (!tsMatch) {
    console.error(`FAIL  ${tsKey} not found in tokens.ts`);
    failed++;
  } else if (!cssMatch) {
    console.error(`FAIL  ${cssVar} not found in globals.css`);
    failed++;
  } else if (tsMatch[1].toLowerCase() !== cssMatch[1].toLowerCase()) {
    console.error(`FAIL  ${cssVar} is ${cssMatch[1]} but tokens.ts says ${tsMatch[1]}`);
    failed++;
  } else {
    console.log(`OK    ${cssVar} ${cssMatch[1]}`);
  }
}

console.log(`\n${pairs.length - failed} matched, ${failed} drifted`);
process.exit(failed === 0 ? 0 : 1);
