import { fetchAuthSession } from "aws-amplify/auth";

type TokenLike = string | { toString?: () => string } | null | undefined;

function normalizeBearerToken(value: TokenLike): string | null {
  if (!value) return null;
  const raw = typeof value === "string" ? value : value.toString?.();
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^bearer\s+/i.test(trimmed)) {
    return trimmed;
  }
  return `Bearer ${trimmed}`;
}

export function buildBearerTokenFromTokens(tokens?: {
  idToken?: string;
  accessToken?: string;
} | null): string | null {
  return normalizeBearerToken(tokens?.idToken ?? tokens?.accessToken ?? null);
}

export function buildBearerTokenFromSession(session?: {
  tokens?: {
    idToken?: TokenLike;
    accessToken?: TokenLike;
  };
} | null): string | null {
  return normalizeBearerToken(session?.tokens?.idToken ?? session?.tokens?.accessToken ?? null);
}

export async function resolveAuthorizationHeaderValue(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return buildBearerTokenFromSession(session);
  } catch {
    return null;
  }
}

export function withAuthHeaderValue(
  headers: Record<string, string> | undefined,
  authHeader: string | null,
): Record<string, string> {
  const next = { ...(headers ?? {}) };
  if (authHeader) {
    next.Authorization = authHeader;
  }
  return next;
}

export async function withAuthHeaders(
  headers?: Record<string, string>,
): Promise<Record<string, string>> {
  const authHeader = await resolveAuthorizationHeaderValue();
  return withAuthHeaderValue(headers, authHeader);
}
