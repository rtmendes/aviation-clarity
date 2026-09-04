/**
 * Assembles the flight-school selector from src/shell.html + schools.json.
 *
 *   index.html    a complete, standalone page — open it in any browser
 *   artifact.html the same page without the document wrapper, which is the
 *                 form the Claude Artifact publisher expects
 *
 * Usage: node build.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(join(here, "src/shell.html"), "utf8");
const schools = JSON.parse(readFileSync(join(here, "schools.json"), "utf8"));

if (!shell.includes("__SCHOOLS_JSON__")) throw new Error("src/shell.html lost its __SCHOOLS_JSON__ placeholder");

// </script> inside a string literal would close the inline script tag early.
const data = JSON.stringify(schools).replace(/<\//g, "<\\/");
const body = shell.replace("__SCHOOLS_JSON__", data);

writeFileSync(join(here, "artifact.html"), body);

// For the standalone page, everything up to the end of the stylesheet belongs
// in <head>; the markup and script that follow are the <body>.
const split = body.indexOf("</style>") + "</style>".length;
const head = body.slice(0, split);
const rest = body.slice(split);
writeFileSync(join(here, "index.html"), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="Compare 18 flight schools within reach of ZIP 10030 on total cost, weeks to checkride, and examiner access — with every input editable." />
<style>:root{color-scheme:light dark}</style>
${head}
</head>
<body>
${rest}
</body>
</html>
`);
console.log(`built index.html + artifact.html — ${schools.length} schools, ${(body.length / 1024).toFixed(0)} KB`);
