import { QueryClient, QueryFunction } from "@tanstack/react-query";

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("API base URL is empty");

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

/**
 * Gets the API base URL.
 *
 * Priority:
 * 1. EXPO_PUBLIC_API_URL when an explicit cross-origin backend is configured.
 * 2. Browser origin for deployed web builds (Vercel and other same-origin hosts).
 * 3. EXPO_PUBLIC_DOMAIN for Replit/native compatibility.
 */
export function getApiUrl(): string {
  const explicitApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (explicitApiUrl?.trim()) {
    return normalizeBaseUrl(explicitApiUrl);
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeBaseUrl(window.location.origin);
  }

  const host = process.env.EXPO_PUBLIC_DOMAIN;
  if (host?.trim()) {
    return normalizeBaseUrl(host);
  }

  throw new Error(
    "No API endpoint is available. Configure EXPO_PUBLIC_API_URL or EXPO_PUBLIC_DOMAIN.",
  );
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

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
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url, {
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
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
