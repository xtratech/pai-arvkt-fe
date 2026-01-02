import { withAuthHeaders } from "@/lib/auth-headers";

export type UserWalletAutoTopupSettings = Record<string, unknown> | null;

export type UserWalletTransaction = Record<string, unknown>;

export type UserWalletResponse = {
  user_id?: string;
  credit_balance?: number;
  total_usage?: number;
  auto_topup_settings?: UserWalletAutoTopupSettings;
  transactions?: UserWalletTransaction[];
  [key: string]: unknown;
};

export const USER_WALLET_UPDATED_EVENT = "pluree:user-wallet-updated";

type UserWalletUpdatedEventDetail = {
  wallet: UserWalletResponse;
  source?: string;
};

function emitWalletUpdated(wallet: UserWalletResponse, source?: string) {
  if (typeof window === "undefined") return;
  if (typeof window.dispatchEvent !== "function") return;
  if (typeof CustomEvent !== "function") return;
  window.dispatchEvent(
    new CustomEvent<UserWalletUpdatedEventDetail>(USER_WALLET_UPDATED_EVENT, {
      detail: { wallet, source },
    }),
  );
}

export type UserWalletUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  [key: string]: unknown;
};

function normalizeBase(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function joinUrl(base: string, path: string) {
  const left = normalizeBase(base);
  const right = String(path ?? "").trim().replace(/^\/+/, "");
  if (!left) return `/${right}`;
  if (!right) return left;
  return `${left}/${right}`;
}

function deriveDefaultWalletEndpoint() {
  const userDataEndpoint = String(process.env.NEXT_PUBLIC_USERDATA_API_ENDPOINT ?? "").trim();
  if (!userDataEndpoint) return "";
  const normalized = normalizeBase(userDataEndpoint);
  return normalized.replace(/\/user-data$/i, "/user-wallet");
}

export function getUserWalletEndpoint() {
  const configured = String(process.env.NEXT_PUBLIC_USERWALLET_API_ENDPOINT ?? "").trim();
  return configured ? normalizeBase(configured) : deriveDefaultWalletEndpoint();
}

function deriveDefaultPaymentsEndpoint() {
  const walletEndpoint = getUserWalletEndpoint();
  if (!walletEndpoint) return "";
  return walletEndpoint.replace(/\/user-wallet$/i, "/payment");
}

export function getPaymentsEndpoint() {
  const configured = String(process.env.NEXT_PUBLIC_PAYMENTS_API_ENDPOINT ?? "").trim();
  return configured ? normalizeBase(configured) : deriveDefaultPaymentsEndpoint();
}

function getUserWalletApiKey() {
  return String(
    process.env.NEXT_PUBLIC_USERWALLET_API_KEY ?? process.env.NEXT_PUBLIC_USERDATA_API_KEY ?? "",
  ).trim();
}

async function buildHeaders(contentType?: string) {
  const headers: Record<string, string> = {
    accept: "application/json",
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  const apiKey = getUserWalletApiKey();
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return withAuthHeaders(headers);
}

async function readJsonSafely(response: Response) {
  return response.json().catch(async () => {
    const text = await response.text().catch(() => "");
    return text || null;
  });
}

export async function fetchUserWallet(userId: string, options?: { signal?: AbortSignal }) {
  const endpoint = getUserWalletEndpoint();
  const resolvedUserId = String(userId ?? "").trim();
  if (!endpoint) {
    throw new Error("User wallet endpoint is not configured.");
  }
  if (!resolvedUserId) {
    throw new Error("Missing user id for wallet lookup.");
  }

  const url = new URL(endpoint);
  url.searchParams.set("user_id", resolvedUserId);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: await buildHeaders(),
    cache: "no-store",
    signal: options?.signal,
  });

  const payload = await readJsonSafely(res);
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && ("message" in payload || "error" in payload)
        ? String((payload as any).message ?? (payload as any).error)
        : `Failed to fetch wallet (status ${res.status})`;
    throw new Error(message);
  }

  const normalized = payload as UserWalletResponse;
  emitWalletUpdated(normalized, "fetchUserWallet");
  return normalized;
}

export async function getWalletStatus(userId: string, options?: { signal?: AbortSignal }) {
  return fetchUserWallet(userId, options);
}

export async function updateUserWalletAutoTopup(
  userId: string,
  autoTopupSettings: unknown,
) {
  const endpoint = getUserWalletEndpoint();
  const resolvedUserId = String(userId ?? "").trim();
  if (!endpoint) {
    throw new Error("User wallet endpoint is not configured.");
  }
  if (!resolvedUserId) {
    throw new Error("Missing user id for wallet update.");
  }
  if (!autoTopupSettings || typeof autoTopupSettings !== "object" || Array.isArray(autoTopupSettings)) {
    throw new Error("'auto_topup_settings' must be a non-empty object.");
  }
  if (Object.keys(autoTopupSettings as Record<string, unknown>).length === 0) {
    throw new Error("'auto_topup_settings' must be a non-empty object.");
  }

  const res = await fetch(endpoint, {
    method: "PUT",
    headers: await buildHeaders("application/json"),
    body: JSON.stringify({
      user_id: resolvedUserId,
      auto_topup_settings: autoTopupSettings,
    }),
  });

  const payload = await readJsonSafely(res);
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && ("message" in payload || "error" in payload)
        ? String((payload as any).message ?? (payload as any).error)
        : `Failed to update wallet (status ${res.status})`;
    throw new Error(message);
  }

  const normalized = payload as UserWalletResponse;
  emitWalletUpdated(normalized, "updateUserWalletAutoTopup");
  return normalized;
}

export async function updateWalletSettings(userId: string, autoTopupSettings: unknown) {
  return updateUserWalletAutoTopup(userId, autoTopupSettings);
}

export async function recordUserWalletUsage(
  userId: string,
  usageMetadata: UserWalletUsageMetadata,
) {
  const endpoint = getUserWalletEndpoint();
  const resolvedUserId = String(userId ?? "").trim();
  if (!endpoint) {
    throw new Error("User wallet endpoint is not configured.");
  }
  if (!resolvedUserId) {
    throw new Error("Missing user id for wallet usage update.");
  }

  const totalTokenCount = Number(usageMetadata?.totalTokenCount);
  if (!Number.isFinite(totalTokenCount) || totalTokenCount <= 0) {
    return null;
  }

  const tokensSpent = Math.max(0, Math.round(totalTokenCount));

  const res = await fetch(endpoint, {
    method: "PUT",
    headers: await buildHeaders("application/json"),
    body: JSON.stringify({
      user_id: resolvedUserId,
      tokens_spent: tokensSpent,
    }),
  });

  const payload = await readJsonSafely(res);
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && ("message" in payload || "error" in payload)
        ? String((payload as any).message ?? (payload as any).error)
        : `Failed to record wallet usage (status ${res.status})`;
    throw new Error(message);
  }

  const normalized = payload as UserWalletResponse;
  emitWalletUpdated(normalized, "recordUserWalletUsage");
  return normalized;
}

export async function createCheckoutSession(
  userId: string,
  options: { quantity: number; successUrl?: string; cancelUrl?: string },
) {
  const endpoint = getPaymentsEndpoint();
  const resolvedUserId = String(userId ?? "").trim();
  const resolvedQty = Number(options?.quantity);
  const successUrl =
    typeof options?.successUrl === "string" ? options.successUrl.trim() : "";
  const cancelUrl =
    typeof options?.cancelUrl === "string" ? options.cancelUrl.trim() : "";
  if (!endpoint) {
    throw new Error("Payments endpoint is not configured.");
  }
  if (!resolvedUserId) {
    throw new Error("Missing user id for checkout session.");
  }
  if (!Number.isFinite(resolvedQty) || resolvedQty <= 0) {
    throw new Error("Quantity must be a positive number.");
  }

  const payload = {
    user_id: resolvedUserId,
    quantity: resolvedQty,
    ...(successUrl ? { success_url: successUrl } : {}),
    ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
  };

  const res = await fetch(joinUrl(endpoint, "/create-checkout-session"), {
    method: "POST",
    headers: await buildHeaders("application/json"),
    body: JSON.stringify(payload),
  });

  const responsePayload = await readJsonSafely(res);
  if (!res.ok) {
    const message =
      responsePayload &&
      typeof responsePayload === "object" &&
      ("message" in responsePayload || "error" in responsePayload)
        ? String((responsePayload as any).message ?? (responsePayload as any).error)
        : `Failed to create checkout session (status ${res.status})`;
    throw new Error(message);
  }

  return responsePayload as { sessionId?: string; session_id?: string; [key: string]: unknown };
}

export async function createSetupIntent(userId: string) {
  const endpoint = getPaymentsEndpoint();
  const resolvedUserId = String(userId ?? "").trim();
  if (!endpoint) {
    throw new Error("Payments endpoint is not configured.");
  }
  if (!resolvedUserId) {
    throw new Error("Missing user id for setup intent.");
  }

  const res = await fetch(joinUrl(endpoint, "/create-setup-intent"), {
    method: "POST",
    headers: await buildHeaders("application/json"),
    body: JSON.stringify({ user_id: resolvedUserId }),
  });

  const payload = await readJsonSafely(res);
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && ("message" in payload || "error" in payload)
        ? String((payload as any).message ?? (payload as any).error)
        : `Failed to create setup intent (status ${res.status})`;
    throw new Error(message);
  }

  return payload as { clientSecret?: string; client_secret?: string; [key: string]: unknown };
}
