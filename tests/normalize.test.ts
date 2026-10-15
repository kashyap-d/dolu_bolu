import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeCompanyName, normalizeRoleTitle } from "../src/features/job-drives/normalize";

describe("company and role normalisation", () => {
  it("treats legal suffixes, punctuation, and case as the same company", () => {
    for (const variant of ["Globex", "globex", "Globex Pvt. Ltd.", "GLOBEX PRIVATE LIMITED", "The Globex Corporation", "Globex, Inc."]) {
      assert.equal(normalizeCompanyName(variant), "globex", variant);
    }
  });

  it("keeps meaningful words and ampersands", () => {
    assert.equal(normalizeCompanyName("AT&T"), "at and t");
    assert.equal(normalizeCompanyName("Zeta Technologies"), "zeta technologies");
    assert.equal(normalizeCompanyName("Company"), "company");
  });

  it("expands common role abbreviations without merging different levels", () => {
    assert.equal(normalizeRoleTitle("Sr. SWE"), normalizeRoleTitle("Senior Software Engineer"));
    assert.equal(normalizeRoleTitle("SDE-1"), "software development engineer 1");
    assert.notEqual(normalizeRoleTitle("SDE 1"), normalizeRoleTitle("SDE 2"));
    assert.equal(normalizeRoleTitle("SRE"), "sre");
  });

  it("keeps names written without ASCII letters distinct", () => {
    assert.equal(normalizeCompanyName("टाटा"), "टाटा");
    assert.notEqual(normalizeCompanyName("टाटा"), normalizeCompanyName("इन्फोसिस"));
  });
});
