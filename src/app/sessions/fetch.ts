export async function getOverviewData() {
  // Fake delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return {
    views: {
      value: 3456,
      growthRate: 0.43,
    },
    profit: {
      value: 4220,
      growthRate: 4.35,
    },
    products: {
      value: 3456,
      growthRate: 2.59,
    },
    users: {
      value: 3456,
      growthRate: -0.95,
    },
  };
}

export async function getSessionsData() {
  const base = process.env.NEXT_PUBLIC_USERDATA_API_ENDPOINT;
  if (!base) return [] as any[];

  try {
    const authHeader = await resolveAuthHeader();
    const res = await fetch(base, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(process.env.NEXT_PUBLIC_USERDATA_API_KEY
          ? { 'x-api-key': String(process.env.NEXT_PUBLIC_USERDATA_API_KEY) }
          : {}),
      } as Record<string, string>,
      // No credentials on server fetch; endpoint should be API-key based
      cache: 'no-store',
    });

    if (!res.ok) {
      return [] as any[];
    }

    const data = await res.json().catch(() => (null as any));
    if (!data) return [] as any[];

    if (Array.isArray(data)) return data as any[];
    if (Array.isArray((data as any).sessions)) return (data as any).sessions as any[];

    return [] as any[];
  } catch {
    return [] as any[];
  }
}

async function resolveAuthHeader() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const { fetchAuthSession } = await import("aws-amplify/auth");
    const session = await fetchAuthSession();
    const token =
      session.tokens?.idToken?.toString() ?? session.tokens?.accessToken?.toString();
    if (!token) return null;
    return token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
  } catch {
    return null;
  }
}
