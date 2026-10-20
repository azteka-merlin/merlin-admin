import test from "node:test";
import assert from "node:assert/strict";
import { customGameMetadata, appendCustomGameMetadata } from "./custom-game-metadata.js";

test("ports leave game controlled by package contents and normalize explicit protected paths", () => {
  const metadata = customGameMetadata({ origin: "port", protectedPaths: ["Game/", "user\\saves", "USER/saves", "settings.ini"] });
  assert.deepEqual(metadata.protectedPaths, ["user/saves", "settings.ini"]);
});

test("protected paths cannot escape or target the installation root", () => {
  for (const path of ["../game", "foo/../bar", ".", "/game", "C:\\game", "\\\\server\\game", "game/*", "user//saves"]) {
    assert.throws(() => customGameMetadata({ protectedPaths: [path] }), /caminhos preservados/);
  }
});

test("GitHub tracking accepts only an HTTPS repository and no credentials or release subpaths", () => {
  assert.equal(customGameMetadata({ origin: "port", repositoryUrl: "https://github.com/author/project.git/" }).repositoryUrl, "https://github.com/author/project");
  for (const url of ["http://github.com/author/project", "https://github.com.evil.test/author/project", "https://user:secret@github.com/author/project", "https://github.com/author/project/releases", "https://github.com/author/project?ref=main"]) {
    assert.throws(() => customGameMetadata({ origin: "port", repositoryUrl: url }));
  }
});

test("native games do not submit hidden repository, Discord, or release tag values", () => {
  assert.deepEqual(customGameMetadata({ origin: "native", repositoryUrl: "invalid", discordUrl: "invalid", trackedReleaseTag: "old", versionLabel: " 1.2 " }), {
    origin: "native", repositoryUrl: "", discordUrl: "", trackedReleaseTag: "", protectedPaths: [], versionLabel: "1.2",
  });
});

test("Discord metadata accepts invitation links and rejects other destinations before uploading", () => {
  for (const url of ["https://discord.gg/invite-code", "https://discord.com/invite/invite_code"]) {
    assert.equal(customGameMetadata({ origin: "port", discordUrl: url }).discordUrl, url);
  }
  for (const url of ["https://example.test/invite", "https://discord.gg/invite?x=1", "https://discord.com/channels/123", "https://discord.gg:8443/invite"]) {
    assert.throws(() => customGameMetadata({ origin: "port", discordUrl: url }), /convite HTTPS/);
  }
});

test("metadata form encodes preservation paths as JSON", () => {
  const body = new FormData();
  appendCustomGameMetadata(body, customGameMetadata({ origin: "port", versionLabel: "v2" }));
  assert.equal(body.get("protectedPaths"), '[]');
  assert.equal(body.get("origin"), "port");
  assert.equal(body.get("versionLabel"), "v2");
});
