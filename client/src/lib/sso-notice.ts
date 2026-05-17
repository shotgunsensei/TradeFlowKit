export type SsoNotice = "provisioned" | "joined" | "signed_in";

const VALID: readonly SsoNotice[] = ["provisioned", "joined", "signed_in"];

export function parseSsoNotice(search: string): SsoNotice | null {
  const params = new URLSearchParams(search);
  const value = params.get("sso");
  if (!value) return null;
  return (VALID as readonly string[]).includes(value) ? (value as SsoNotice) : null;
}

export function stripSsoFromUrl(parts: { pathname: string; search: string; hash: string }): string {
  const params = new URLSearchParams(parts.search);
  params.delete("sso");
  const qs = params.toString();
  return parts.pathname + (qs ? `?${qs}` : "") + (parts.hash || "");
}
