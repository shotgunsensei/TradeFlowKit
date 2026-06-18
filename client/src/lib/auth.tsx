import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User, Org, Membership } from "@shared/schema";

interface PlanLimits {
  customers: number;
  jobs: number;
  quotes: number;
  invoices: number;
  teamMembers: number;
  canInvite: boolean;
}

interface OrgCounts {
  customers: number;
  jobs: number;
  quotes: number;
  invoices: number;
  members: number;
}

interface ResolvedAccess {
  source: "operatoros" | "legacy";
  linked: boolean;
  allowed: boolean;
  reason: string | null;
  planSlug: string | null;
  subscriptionStatus: string | null;
  accessLevel: string | null;
  features: Record<string, boolean>;
  limits: {
    customers: number;
    jobs: number;
    quotes: number;
    invoices: number;
    teamMembers: number;
    canInvite: boolean;
  };
  effectiveRole: string;
}

interface AuthContextType {
  user: User | null;
  org: Org | null;
  membership: Membership | null;
  orgs: Org[];
  planLimits: PlanLimits | null;
  orgCounts: OrgCounts | null;
  access: ResolvedAccess | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  verify2fa: (payload: { code?: string; recoveryCode?: string }) => Promise<void>;
  register: (username: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  switchOrg: (orgId: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [planLimits, setPlanLimits] = useState<PlanLimits | null>(null);
  const [orgCounts, setOrgCounts] = useState<OrgCounts | null>(null);
  const [access, setAccess] = useState<ResolvedAccess | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setOrg(data.org);
        setMembership(data.membership);
        setOrgs(data.orgs || []);
        setPlanLimits(data.planLimits || null);
        setOrgCounts(data.orgCounts || null);
        setAccess(data.access || null);
      } else {
        setUser(null);
        setOrg(null);
        setMembership(null);
        setOrgs([]);
        setPlanLimits(null);
        setOrgCounts(null);
        setAccess(null);
      }
    } catch {
      setUser(null);
      setOrg(null);
      setMembership(null);
      setOrgs([]);
      setPlanLimits(null);
      setOrgCounts(null);
      setAccess(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const login = async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || "Login failed");
    }
    const data = await res.json().catch(() => ({}));
    if (data?.requires2fa) {
      const err: any = new Error("Two-factor verification required");
      err.requires2fa = true;
      throw err;
    }
    await refreshAuth();
  };

  const verify2fa = async (payload: { code?: string; recoveryCode?: string }) => {
    const res = await fetch("/api/auth/login/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: "Verification failed" }));
      throw new Error(errBody.error || "Verification failed");
    }
    await refreshAuth();
  };

  const register = async (username: string, password: string, fullName: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, fullName }),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || "Registration failed");
    }
    await refreshAuth();
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setOrg(null);
    setMembership(null);
    setOrgs([]);
    setPlanLimits(null);
    setOrgCounts(null);
  };

  const switchOrg = async (orgId: string) => {
    const res = await fetch("/api/auth/switch-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId }),
      credentials: "include",
    });
    if (res.ok) {
      await refreshAuth();
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, org, membership, orgs, planLimits, orgCounts, access, isLoading, login, verify2fa, register, logout, switchOrg, refreshAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
