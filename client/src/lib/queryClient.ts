import { QueryClient, QueryFunction } from "@tanstack/react-query";

export type FeatureNotInPlanError = {
  error: "feature_not_in_plan";
  feature: string;
  linked: boolean;
  planSlug: string | null;
  message?: string;
};

export class ApiError<T = unknown> extends Error {
  status: number;
  data: T | null;
  constructor(status: number, message: string, data: T | null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function isFeatureNotInPlan(data: unknown): data is FeatureNotInPlanError {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.error === "feature_not_in_plan" && typeof d.feature === "string";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let bodyText = "";
    let bodyJson: unknown = null;
    if (contentType.includes("application/json")) {
      try {
        bodyJson = await res.json();
        const obj = (bodyJson ?? {}) as Record<string, unknown>;
        const message = typeof obj.message === "string" ? obj.message : undefined;
        const errorField = typeof obj.error === "string" ? obj.error : undefined;
        bodyText = message || errorField || JSON.stringify(bodyJson);
      } catch {
        bodyText = res.statusText;
      }
    } else {
      bodyText = (await res.text()) || res.statusText;
    }

    if (res.status === 403 && isFeatureNotInPlan(bodyJson)) {
      try {
        window.dispatchEvent(
          new CustomEvent<FeatureNotInPlanError>("tfk:feature-not-in-plan", {
            detail: bodyJson,
          }),
        );
      } catch {
        // SSR / no window — ignore
      }
    }

    throw new ApiError(res.status, `${res.status}: ${bodyText}`, bodyJson ?? null);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 0,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
