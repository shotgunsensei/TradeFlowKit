// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";

const toastMock = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn(), toasts: [] }),
}));

const authState: any = {
  user: { id: "u1", username: "owner", fullName: "Owner", isSuperAdmin: false },
  org: { id: "o1", name: "Acme", operatorosOrganizationId: null, logoUrl: "" },
  membership: { role: "owner" },
  refreshAuth: vi.fn(),
};

vi.mock("@/lib/auth", () => ({
  useAuth: () => authState,
}));

const useQueryMock = vi.fn();
const useMutationMock = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: any[]) => useQueryMock(...args),
  useMutation: (...args: any[]) => useMutationMock(...args),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...p }: any) => <div {...p}>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...p }: any) => <button {...p}>{children}</button>,
}));
vi.mock("@/components/ui/input", () => ({
  Input: (p: any) => <input {...p} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...p }: any) => <label {...p}>{children}</label>,
}));
vi.mock("@/components/ui/form", () => ({
  Form: ({ children }: any) => <>{children}</>,
  FormControl: ({ children }: any) => <>{children}</>,
  FormField: ({ render: r, name }: any) =>
    r({ field: { name, value: "", onChange: () => {}, onBlur: () => {}, ref: () => {} } }),
  FormItem: ({ children }: any) => <div>{children}</div>,
  FormLabel: ({ children }: any) => <label>{children}</label>,
  FormMessage: ({ children }: any) => <span>{children}</span>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-mock-select data-value={value || ""} onClick={() => onValueChange?.("org_1")}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, ...p }: any) => <div {...p}>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value, ...p }: any) => (
    <div data-value={value} {...p}>
      {children}
    </div>
  ),
}));

import OrganizationTab from "../client/src/pages/settings/organization";

beforeEach(() => {
  toastMock.mockReset();
  useQueryMock.mockReset();
  useMutationMock.mockClear();
  authState.org = { id: "o1", name: "Acme", operatorosOrganizationId: null, logoUrl: "" };
});

afterEach(() => {
  cleanup();
});

describe("OperatorOS org picker", () => {
  it("renders organization names from the API in the picker", () => {
    useQueryMock.mockReturnValue({
      data: {
        available: true,
        organizations: [
          { id: "org_1", name: "Acme Plumbing" },
          { id: "org_2", name: "Widgets Inc" },
        ],
      },
      isLoading: false,
    });

    render(<OrganizationTab />);

    expect(screen.getByTestId("select-operatoros-org-id")).toBeTruthy();
    expect(screen.getByTestId("option-operatoros-org-org_1")).toBeTruthy();
    expect(screen.getByTestId("option-operatoros-org-org_2")).toBeTruthy();
    expect(screen.getByText("Acme Plumbing")).toBeTruthy();
    expect(screen.getByText("Widgets Inc")).toBeTruthy();

    expect(screen.queryByTestId("input-operatoros-org-id")).toBeNull();
    expect(screen.getByTestId("button-operatoros-manual-entry")).toBeTruthy();
  });

  it("reveals the manual-entry input when the fallback link is clicked", () => {
    useQueryMock.mockReturnValue({
      data: {
        available: true,
        organizations: [{ id: "org_1", name: "Acme Plumbing" }],
      },
      isLoading: false,
    });

    render(<OrganizationTab />);
    expect(screen.queryByTestId("input-operatoros-org-id")).toBeNull();

    fireEvent.click(screen.getByTestId("button-operatoros-manual-entry"));

    expect(screen.getByTestId("input-operatoros-org-id")).toBeTruthy();
    expect(screen.getByTestId("button-operatoros-pick-from-list")).toBeTruthy();
  });

  it("falls back to plain input when the API reports unavailable", () => {
    useQueryMock.mockReturnValue({
      data: { available: false, reason: "unavailable" },
      isLoading: false,
    });

    render(<OrganizationTab />);
    expect(screen.queryByTestId("select-operatoros-org-id")).toBeNull();
    expect(screen.getByTestId("input-operatoros-org-id")).toBeTruthy();
    expect(screen.getByTestId("text-operatoros-list-unavailable").textContent).toMatch(/Couldn't reach/i);
  });

  it("shows the not_linked hint when user has never SSO'd", () => {
    useQueryMock.mockReturnValue({
      data: { available: false, reason: "not_linked" },
      isLoading: false,
    });
    render(<OrganizationTab />);
    expect(screen.getByTestId("text-operatoros-list-unavailable").textContent).toMatch(/Sign in via OperatorOS/i);
  });
});
