import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyPremiumDraft, createPremiumDraft, normalizePremiumPayload, retryDisplay, contactPhone } from "./premium-admin.js";

test("game draft and edits preserve coming-soon state", () => {
  assert.equal(createEmptyPremiumDraft().comingSoon, false);
  const draft = createPremiumDraft({ appId: "123", comingSoon: true, enabled: true, activationType: "third_party" });
  assert.equal(draft.wasComingSoon, true);
  assert.equal(normalizePremiumPayload(draft).comingSoon, true);
  assert.equal(normalizePremiumPayload({ ...draft, comingSoon: false, launchExecutablePath: "game.exe" }).comingSoon, false);
  assert.throws(() => normalizePremiumPayload({ ...draft, comingSoon: false }), /executavel/);
});
test("exclusive grant prevents a second grant until its original deadline", () => {
  const now = Date.parse("2026-11-02T15:00:00Z");
  const activation = { status: "active", retry: { status: "available", expiresAt: "2026-11-02T15:15:00Z" } };
  assert.equal(retryDisplay(activation, now).canGrant, false);
  assert.equal(retryDisplay(activation, now + 15 * 60000).canGrant, true);
  assert.equal(retryDisplay({ status: "expired" }, now).canGrant, false);
});
test("uncertain result requires support review and processing cannot be repeated", () => {
  assert.deepEqual(retryDisplay({ status: "active", retry: { status: "review" } }), { label: "Verificar tentativa", tone: "warning", canGrant: true, review: true });
  assert.equal(retryDisplay({ status: "active", retry: { status: "processing" } }).canGrant, false);
});
test("phone is displayed only when consent exists for that game", () => {
  assert.equal(contactPhone({ phone: "11999999999" }), "");
  assert.equal(contactPhone({ phone: "11999999999", phoneConsentAt: "2026-11-02T15:00:00Z" }), "(11) 99999-9999");
});


test("wishlist contacts format Brazilian numbers without truncating international numbers", () => {
  const display = phone => contactPhone({ phone, phoneConsentAt: "2026-11-02T15:00:00Z" });
  assert.equal(display("1133334444"), "(11) 3333-4444");
  assert.equal(display("+55 11 99999 9999"), "+55 (11) 99999-9999");
  assert.equal(display("5511999999999"), "+55 (11) 99999-9999");
  assert.equal(display("+351 912 345 678"), "+351 912 345 678");
  assert.equal(display("+1 212 555 1234"), "+1 212 555 1234");
  assert.equal(display("123456789012345"), "123456789012345");
});
