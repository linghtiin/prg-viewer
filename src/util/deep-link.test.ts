import assert from "node:assert/strict";
import test from "node:test";
import { buildPrgUri } from "./deep-link.ts";

test("builds a Windows absolute link", () => {
  assert.equal(
    buildPrgUri({ path: "C:\\Users\\me\\Documents\\Mind Vault\\map.prg" }),
    "prg:///C:/Users/me/Documents/Mind%20Vault/map.prg",
  );
});

test("builds a POSIX absolute link", () => {
  assert.equal(buildPrgUri({ path: "/home/me/maps/map.prg" }), "prg:///home/me/maps/map.prg");
});

test("appends target, location and zoom", () => {
  assert.equal(
    buildPrgUri({
      path: "C:\\vault\\a.prg",
      target: "ec32d43d-7890-4e45-a28f-b31bca4dafea",
      location: { x: 100.456, y: -200.001 },
      zoom: 1.5,
    }),
    "prg:///C:/vault/a.prg?target=ec32d43d-7890-4e45-a28f-b31bca4dafea&location=100.46,-200&zoom=1.5",
  );
});

test("encodes CJK and reserved characters in the path", () => {
  assert.equal(
    buildPrgUri({ path: "C:\\库\\知识 图谱?.prg" }),
    "prg:///C:/%E5%BA%93/%E7%9F%A5%E8%AF%86%20%E5%9B%BE%E8%B0%B1%3F.prg",
  );
});

test("omits empty optional parameters", () => {
  assert.equal(buildPrgUri({ path: "/a.prg", target: "" }), "prg:///a.prg");
  assert.equal(buildPrgUri({ path: "/a.prg", zoom: Number.NaN }), "prg:///a.prg");
});
