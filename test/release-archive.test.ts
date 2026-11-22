import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";
import { RELEASE_ARCHIVE_NAME, RELEASE_ARTIFACTS, buildReleaseArchive } from "../scripts/release-archive.ts";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

function releaseFiles(): { name: string; data: Uint8Array }[] {
  return [
    { name: "main.js", data: bytes("console.log('plugin');") },
    { name: "manifest.json", data: bytes('{"id":"prg-viewer","version":"0.3.0"}') },
    { name: "styles.css", data: bytes(".prg-viewer {}") },
  ];
}

test("the release asset is one zip named after the plugin", () => {
  assert.equal(RELEASE_ARCHIVE_NAME, "prg-viewer.zip");
});

test("buildReleaseArchive puts exactly the three artifacts at the archive root", () => {
  const entries = unzipSync(buildReleaseArchive(releaseFiles()));

  assert.deepEqual(Object.keys(entries).sort(), [...RELEASE_ARTIFACTS].sort());
  assert.equal(new TextDecoder().decode(entries["main.js"]), "console.log('plugin');");
  assert.equal(new TextDecoder().decode(entries["styles.css"]), ".prg-viewer {}");
});

test("buildReleaseArchive ignores unrelated files", () => {
  const entries = unzipSync(
    buildReleaseArchive([...releaseFiles(), { name: "notes.txt", data: bytes("ignore me") }]),
  );

  assert.deepEqual(Object.keys(entries).sort(), [...RELEASE_ARTIFACTS].sort());
});

test("buildReleaseArchive is byte-identical for identical inputs", () => {
  assert.deepEqual(buildReleaseArchive(releaseFiles()), buildReleaseArchive(releaseFiles()));
});

test("buildReleaseArchive refuses missing or empty artifacts", () => {
  const withoutStyles = releaseFiles().filter((file) => file.name !== "styles.css");
  assert.throws(() => buildReleaseArchive(withoutStyles), /styles\.css/);

  const emptyMain = releaseFiles().map((file) =>
    file.name === "main.js" ? { ...file, data: new Uint8Array(0) } : file,
  );
  assert.throws(() => buildReleaseArchive(emptyMain), /main\.js 为空/);
});
