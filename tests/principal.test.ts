import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { principalFromClaims } from "../src/server/auth/principal";

const sub = "6f1c3b9e-8d2a-4c1e-9f0a-1b2c3d4e5f60";

describe("principalFromClaims", () => {
  it("accepts an anonymous (demo) session, whose email claim is empty", () => {
    // Regression: rejecting this while the proxy accepted it looped between /login and /app.
    assert.deepEqual(principalFromClaims({ sub, email: "", phone: "", is_anonymous: true }), {
      id: sub,
      email: null,
      displayName: null,
      isAnonymous: true,
    });
  });

  it("reads a Google user's email and name", () => {
    const principal = principalFromClaims({
      sub,
      email: "asha@example.com",
      user_metadata: { full_name: "  Asha Rao ", name: "Asha" },
    });
    assert.equal(principal?.email, "asha@example.com");
    assert.equal(principal?.displayName, "Asha Rao");
    assert.equal(principal?.isAnonymous, false);
  });

  it("treats malformed optional claims as unknown rather than signing the user out", () => {
    const principal = principalFromClaims({ sub, email: "not-an-email", user_metadata: "oops", is_anonymous: "yes" });
    assert.deepEqual(principal, { id: sub, email: null, displayName: null, isAnonymous: false });
  });

  it("rejects a session without a valid user id", () => {
    assert.equal(principalFromClaims({ email: "asha@example.com" }), null);
    assert.equal(principalFromClaims({ sub: "not-a-uuid" }), null);
    assert.equal(principalFromClaims(undefined), null);
  });
});
