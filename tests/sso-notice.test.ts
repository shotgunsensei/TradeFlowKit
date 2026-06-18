import { describe, it, expect } from "vitest";
import { parseSsoNotice, stripSsoFromUrl } from "../client/src/lib/sso-notice";

describe("parseSsoNotice", () => {
  it("returns 'provisioned' for ?sso=provisioned", () => {
    expect(parseSsoNotice("?sso=provisioned")).toBe("provisioned");
  });

  it("returns 'joined' for ?sso=joined", () => {
    expect(parseSsoNotice("?sso=joined")).toBe("joined");
  });

  it("returns 'signed_in' for ?sso=signed_in", () => {
    expect(parseSsoNotice("?sso=signed_in")).toBe("signed_in");
  });

  it("returns null when no sso param is present", () => {
    expect(parseSsoNotice("")).toBeNull();
    expect(parseSsoNotice("?foo=bar")).toBeNull();
  });

  it("returns null for an unknown sso value", () => {
    expect(parseSsoNotice("?sso=hacked")).toBeNull();
  });

  it("works with a bare search string (no leading ?)", () => {
    expect(parseSsoNotice("sso=joined")).toBe("joined");
  });
});

describe("stripSsoFromUrl", () => {
  it("removes the sso param and keeps the rest of the URL intact", () => {
    expect(
      stripSsoFromUrl({ pathname: "/dashboard", search: "?sso=provisioned", hash: "" })
    ).toBe("/dashboard");
  });

  it("preserves other query params", () => {
    expect(
      stripSsoFromUrl({ pathname: "/dashboard", search: "?sso=joined&foo=bar", hash: "" })
    ).toBe("/dashboard?foo=bar");
  });

  it("preserves hash fragments", () => {
    expect(
      stripSsoFromUrl({ pathname: "/dashboard", search: "?sso=joined", hash: "#section" })
    ).toBe("/dashboard#section");
  });

  it("is a no-op when there is no sso param", () => {
    expect(
      stripSsoFromUrl({ pathname: "/dashboard", search: "?foo=bar", hash: "" })
    ).toBe("/dashboard?foo=bar");
  });

  it("simulates the dashboard's one-time-cleanup flow", () => {
    let pathname = "/dashboard";
    let search = "?sso=provisioned";
    let hash = "";

    expect(parseSsoNotice(search)).toBe("provisioned");

    const cleaned = stripSsoFromUrl({ pathname, search, hash });
    expect(cleaned).toBe("/dashboard");

    const parts = cleaned.split(/[?#]/);
    pathname = parts[0];
    search = cleaned.includes("?") ? `?${cleaned.split("?")[1].split("#")[0]}` : "";
    hash = cleaned.includes("#") ? `#${cleaned.split("#")[1]}` : "";

    expect(parseSsoNotice(search)).toBeNull();
  });
});
