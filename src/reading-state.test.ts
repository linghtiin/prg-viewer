import assert from "node:assert/strict";
import test from "node:test";
import type { CameraState } from "./scene/camera.ts";
import {
  READING_STATE_FILE,
  READING_STATE_VERSION,
  mergeCameraStates,
  type CameraStateMap,
  normalizeCameraStates,
  parseViewState,
  readingStatePath,
  serializeViewState,
} from "./reading-state.ts";

test("normalizeCameraStates returns an empty map for invalid input", () => {
  for (const raw of [undefined, null, "nope", 42, [], true]) {
    assert.deepEqual(normalizeCameraStates(raw), {});
  }
});

test("normalizeCameraStates keeps valid records and drops malformed ones", () => {
  const states = normalizeCameraStates({
    "a.prg": { x: 1, y: 2, scale: 0.5 },
    "b.prg": { x: 1, y: 2 },
    "c.prg": { x: Number.NaN, y: 2, scale: 1 },
    "d.prg": { x: "1", y: 2, scale: 1 },
    "e.prg": null,
    "f.prg": [1, 2, 3],
    "": { x: 1, y: 2, scale: 1 },
  });
  assert.deepEqual(states, { "a.prg": { x: 1, y: 2, scale: 0.5 } });
});

test("parseViewState rejects non-object documents", () => {
  for (const text of ["{", "null", "[]", '"cameras"', "42"]) {
    assert.equal(parseViewState(text), null);
  }
});

test("parseViewState reads cameras and tolerates unknown versions and fields", () => {
  const text = JSON.stringify({
    version: 99,
    extra: true,
    cameras: { "a.prg": { x: 1, y: 2, scale: 3 }, "b.prg": "bad" },
  });
  assert.deepEqual(parseViewState(text), { "a.prg": { x: 1, y: 2, scale: 3 } });
  assert.deepEqual(parseViewState("{}"), {});
  assert.deepEqual(parseViewState('{"cameras": null}'), {});
});

test("serializeViewState is sorted, stable and round-trips", () => {
  const text = serializeViewState({
    "b.prg": { x: 2, y: 3, scale: 1 },
    "a.prg": { x: 1, y: 2, scale: 0.5 },
  });
  assert.equal(
    text,
    `{
  "version": ${READING_STATE_VERSION},
  "cameras": {
    "a.prg": {
      "x": 1,
      "y": 2,
      "scale": 0.5
    },
    "b.prg": {
      "x": 2,
      "y": 3,
      "scale": 1
    }
  }
}
`,
  );
  assert.deepEqual(parseViewState(text), {
    "a.prg": { x: 1, y: 2, scale: 0.5 },
    "b.prg": { x: 2, y: 3, scale: 1 },
  });
  assert.equal(
    serializeViewState({}),
    `{
  "version": ${READING_STATE_VERSION},
  "cameras": {}
}
`,
  );
});

test("serializeViewState skips records that vanished from the map", () => {
  const states: Record<string, CameraState | undefined> = { "a.prg": { x: 1, y: 2, scale: 1 } };
  states["b.prg"] = undefined;
  assert.equal(serializeViewState(states as CameraStateMap).includes("b.prg"), false);
});

test("mergeCameraStates prefers the state file and keeps legacy-only paths", () => {
  const stateFile = { "a.prg": { x: 1, y: 2, scale: 1 } };
  const legacy = { "a.prg": { x: 9, y: 9, scale: 9 }, "b.prg": { x: 3, y: 4, scale: 0.25 } };
  assert.deepEqual(mergeCameraStates(stateFile, legacy), {
    "a.prg": { x: 1, y: 2, scale: 1 },
    "b.prg": { x: 3, y: 4, scale: 0.25 },
  });
  assert.deepEqual(mergeCameraStates(null, legacy), legacy);
  assert.deepEqual(mergeCameraStates(stateFile, null), stateFile);
  assert.deepEqual(mergeCameraStates(null, null), {});
});

test("readingStatePath points inside the plugin folder", () => {
  assert.equal(READING_STATE_FILE, "reading-state.json");
  assert.equal(
    readingStatePath(".obsidian", ".obsidian/plugins/project-graph-viewer", "project-graph-viewer"),
    `.obsidian/plugins/project-graph-viewer/${READING_STATE_FILE}`,
  );
  assert.equal(
    readingStatePath(".obsidian", ".obsidian/plugins/project-graph-viewer/", "project-graph-viewer"),
    `.obsidian/plugins/project-graph-viewer/${READING_STATE_FILE}`,
  );
  assert.equal(
    readingStatePath("my-config", undefined, "project-graph-viewer"),
    `my-config/plugins/project-graph-viewer/${READING_STATE_FILE}`,
  );
  assert.equal(
    readingStatePath("my-config", "", "project-graph-viewer"),
    `my-config/plugins/project-graph-viewer/${READING_STATE_FILE}`,
  );
  assert.equal(
    readingStatePath("config", ".obsidian\\plugins\\project-graph-viewer\\", "id"),
    ".obsidian\\plugins\\project-graph-viewer/reading-state.json",
  );
});
