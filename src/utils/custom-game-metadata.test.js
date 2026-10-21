import test from "node:test";
import assert from "node:assert/strict";
import { customGameMetadata, appendCustomGameMetadata } from "./custom-game-metadata.js";

test("ports leave game controlled by package contents and normalize protected paths", () => {
  const metadata = customGameMetadata({ origin: "port", protectedPaths: ["Game/", "user\\saves", "USER/saves", "settings.ini"] });
  assert.deepEqual(metadata, { origin: "port", protectedPaths: ["user/saves", "settings.ini"] });
});

test("protected paths cannot escape or target the installation root", () => {
  for (const path of ["../game", "foo/../bar", ".", "/game", "C:\\game", "\\\\server\\game", "game/*", "user//saves"]) {
    assert.throws(() => customGameMetadata({ protectedPaths: [path] }), /caminhos preservados/);
  }
});

test("obsolete release metadata is not submitted", () => {
  const metadata = customGameMetadata({ origin: "native", repositoryUrl: "old", discordUrl: "old",
    trackedReleaseTag: "old", versionLabel: "old" });
  assert.deepEqual(metadata, { origin: "native", protectedPaths: [] });
  const body = new FormData(); appendCustomGameMetadata(body, metadata);
  assert.deepEqual([...body.keys()].sort(), ["origin", "protectedPaths"]);
  assert.equal(body.get("protectedPaths"), "[]");
});
