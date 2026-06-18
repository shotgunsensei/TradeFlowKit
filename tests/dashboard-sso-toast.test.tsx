// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

const toastMock = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn(), toasts: [] }),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", username: "demo", fullName: "Demo User" },
    org: { id: "o1", name: "Acme Plumbing", plan: "small_business" },
    membership: { role: "owner" },
    orgs: [],
    planLimits: null,
    orgCounts: null,
    isLoading: false,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("wouter", () => ({
  Link: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/components/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/components/status-badge", () => ({ StatusBadge: () => null }));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: () => null }));
vi.mock("@/components/dashboard/quick-actions", () => ({ QuickActions: () => null }));
vi.mock("@/components/dashboard/activity-feed", () => ({ ActivityFeed: () => null }));
vi.mock("@/components/dashboard/revenue-chart", () => ({ RevenueChart: () => null }));
vi.mock("@/components/pwa-install-banner", () => ({ PwaInstallBanner: () => null }));

import Dashboard from "../client/src/pages/dashboard";

function setUrl(search: string, hash = "") {
  window.history.replaceState({}, "", "/dashboard" + search + hash);
}

beforeEach(() => {
  toastMock.mockReset();
  setUrl("");
});

afterEach(() => {
  cleanup();
});

describe("Dashboard SSO toast", () => {
  it("renders a 'provisioned' toast once on /dashboard?sso=provisioned and cleans the URL", () => {
    setUrl("?sso=provisioned");
    const { rerender } = render(<Dashboard />);

    expect(toastMock).toHaveBeenCalledTimes(1);
    const call = toastMock.mock.calls[0][0];
    expect(call.title).toContain("Acme Plumbing");
    expect(call.title).toContain("OperatorOS");
    expect(call.description).toMatch(/created this organization/i);

    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe("");

    // Rerender (simulates a parent re-render): toast should NOT fire a second time.
    rerender(<Dashboard />);
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it("renders a 'joined' toast on /dashboard?sso=joined and cleans the URL", () => {
    setUrl("?sso=joined");
    render(<Dashboard />);

    expect(toastMock).toHaveBeenCalledTimes(1);
    const call = toastMock.mock.calls[0][0];
    expect(call.description).toMatch(/added to this organization/i);
    expect(window.location.search).toBe("");
  });

  it("renders a minimal 'signed_in' toast on /dashboard?sso=signed_in and cleans the URL", () => {
    setUrl("?sso=signed_in");
    render(<Dashboard />);

    expect(toastMock).toHaveBeenCalledTimes(1);
    const call = toastMock.mock.calls[0][0];
    expect(call.title).toContain("OperatorOS");
    expect(call.description).toBeUndefined();
    expect(window.location.search).toBe("");
  });

  it("does not render a toast when there is no ?sso= query param", () => {
    setUrl("");
    render(<Dashboard />);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("ignores unknown sso values: no toast and leaves the URL untouched", () => {
    setUrl("?sso=hacked&keep=me");
    render(<Dashboard />);
    expect(toastMock).not.toHaveBeenCalled();
    // Unknown value is ignored — cleanup only runs when we actually showed a notice.
    expect(window.location.search).toBe("?sso=hacked&keep=me");
  });

  it("preserves other query params and hash when stripping ?sso", () => {
    setUrl("?sso=joined&foo=bar", "#section");
    render(<Dashboard />);
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?foo=bar");
    expect(window.location.hash).toBe("#section");
  });
});
