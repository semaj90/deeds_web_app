import { describe, it, expect } from "vitest";
import { FEATURE_ID_RE, isValidFeatureId } from "./feature-identity";

describe("FeatureId validation", () => {
  it("accepts valid canonical feature ID", () => {
    expect(isValidFeatureId("feature:todo:0123456789abcdef01234567")).toBe(true);
  });

  it("accepts valid feature ID with uppercase hex", () => {
    expect(isValidFeatureId("feature:todo:0123456789ABCDEF01234567")).toBe(true);
  });

  it("rejects invalid feature ID - missing sourceKind", () => {
    expect(isValidFeatureId("todo:0123456789abcdef01234567")).toBe(false);
  });

  it("rejects invalid feature ID - missing digest", () => {
    expect(isValidFeatureId("feature:todo")).toBe(false);
  });

  it("rejects invalid feature ID - wrong digest length", () => {
    expect(isValidFeatureId("feature:todo:0123456789abcdef")).toBe(false);
  });

  it("rejects invalid feature ID - non-hex characters", () => {
    expect(isValidFeatureId("feature:todo:0123456789abcdeG0123456")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidFeatureId("")).toBe(false);
  });

  it("FEATURE_ID_RE matches canonical format", () => {
    expect(FEATURE_ID_RE.test("feature:todo:0123456789abcdef01234567")).toBe(true);
  });
});
