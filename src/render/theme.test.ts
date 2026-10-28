import assert from "node:assert/strict";
import test from "node:test";
import { buildTheme, type CssVarReader } from "./theme.ts";

test("buildTheme reads every expected variable", () => {
  const values: Record<string, string> = {
    "--background-primary": "#101010",
    "--text-normal": "#eeeeee",
    "--text-muted": "#999999",
    "--background-modifier-border": "#333333",
    "--interactive-accent": "#00aaff",
    "--background-modifier-hover": "rgba(255,255,255,0.05)",
    "--text-faint": "#777777",
    "--background-secondary": "#1a1a1a",
  };
  const read: CssVarReader = (name, fallback) => values[name] ?? fallback;
  const theme = buildTheme(read, true);
  assert.equal(theme.dark, true);
  assert.equal(theme.background, "#101010");
  assert.equal(theme.text, "#eeeeee");
  assert.equal(theme.border, "#333333");
  assert.equal(theme.selection, "#00aaff");
  assert.equal(theme.sectionFill, "rgba(255,255,255,0.05)");
  assert.equal(theme.edge, "#777777");
  assert.equal(theme.unknownFill, "#1a1a1a");
});

test("buildTheme supplies sensible fallbacks", () => {
  const read: CssVarReader = (_name, fallback) => fallback;
  const dark = buildTheme(read, true);
  assert.equal(dark.background, "#1e1e1e");
  assert.equal(dark.text, "#dcddde");
  assert.equal(dark.mutedText, "#a3a3a3");
  const light = buildTheme(read, false);
  assert.equal(light.background, "#ffffff");
  assert.equal(light.text, "#1e1e1e");
  assert.ok(light.border.length > 0);
});
