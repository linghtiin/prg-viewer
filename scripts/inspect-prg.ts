/**
 * Developer tool: decodes one or more `.prg` files and prints a summary.
 *
 * It is the quickest way to check that the parser still understands real files
 * produced by Project Graph, and it doubles as the regression harness described
 * in docs/compatibility.md.
 *
 * Usage:
 *   pnpm inspect <file.prg> [more.prg] [--json]
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { PrgError } from "../src/format/errors.ts";
import { parsePrg } from "../src/format/build-document.ts";
import type { PrgDocument } from "../src/format/types.ts";

interface Summary {
  file: string;
  bytes: number;
  version: string;
  tags: string[];
  counts: Record<string, number>;
  edges: number;
  attachments: number;
  bounds: { x: number; y: number; width: number; height: number };
  warnings: { code: string; message: string; ref?: string }[];
  error?: string;
}

function summarise(path: string, document: PrgDocument, bytes: number): Summary {
  const counts: Record<string, number> = {};
  for (const node of document.nodes.values()) {
    counts[node.kind] = (counts[node.kind] ?? 0) + 1;
  }
  return {
    file: path,
    bytes,
    version: document.metadata.version,
    tags: document.tags,
    counts,
    edges: document.edges.length,
    attachments: document.attachments.size,
    bounds: document.bounds,
    warnings: document.warnings,
  };
}

function printSummary(summary: Summary): void {
  const counts = Object.entries(summary.counts)
    .map(([kind, count]) => `${kind}=${count}`)
    .join(", ");
  console.log(`\n${summary.file}`);
  console.log(`  size        ${summary.bytes} bytes`);
  console.log(`  version     ${summary.version}`);
  console.log(`  tags        ${summary.tags.join(", ") || "-"}`);
  console.log(`  nodes       ${counts || "-"}`);
  console.log(`  edges       ${summary.edges}`);
  console.log(`  attachments ${summary.attachments}`);
  const { x, y, width, height } = summary.bounds;
  console.log(
    `  bounds      x=${x.toFixed(1)} y=${y.toFixed(1)} w=${width.toFixed(1)} h=${height.toFixed(1)}`,
  );
  if (summary.warnings.length > 0) {
    console.log(`  warnings    ${summary.warnings.length}`);
    for (const warning of summary.warnings.slice(0, 10)) {
      console.log(`    - [${warning.code}] ${warning.message}`);
    }
    if (summary.warnings.length > 10) {
      console.log(`    … ${summary.warnings.length - 10} more`);
    }
  }
}

function main(argv: string[]): number {
  const json = argv.includes("--json");
  const files = argv.filter((argument) => !argument.startsWith("--"));
  if (files.length === 0) {
    console.error("usage: pnpm inspect <file.prg> [more.prg] [--json]");
    return 2;
  }

  const summaries: Summary[] = [];
  let failed = false;

  for (const file of files) {
    try {
      const bytes = new Uint8Array(readFileSync(file));
      const document = parsePrg(bytes);
      const summary = summarise(file, document, bytes.byteLength);
      summaries.push(summary);
      if (!json) printSummary(summary);
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      const summary: Summary = {
        file,
        bytes: 0,
        version: "-",
        tags: [],
        counts: {},
        edges: 0,
        attachments: 0,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        warnings: [],
        error: message,
      };
      summaries.push(summary);
      if (!json) {
        const code = error instanceof PrgError ? error.code : "unknown";
        console.error(`\n${basename(file)}: [${code}] ${message}`);
        if (error instanceof PrgError && error.details) console.error(`  ${error.details}`);
      }
    }
  }

  if (json) {
    console.log(JSON.stringify(summaries, null, 2));
  }
  return failed ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
