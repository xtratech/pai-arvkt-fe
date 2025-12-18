"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/contexts/user-context";
import {
  fetchUserWallet,
  USER_WALLET_UPDATED_EVENT,
  type UserWalletResponse,
} from "@/services/user-wallet";

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof atob === "function") {
    return atob(normalized);
  }
  const bufferLike = (globalThis as Record<string, unknown>).Buffer as
    | { from: (input: string, encoding: string) => { toString: (encoding: string) => string } }
    | undefined;
  if (bufferLike) {
    return bufferLike.from(normalized, "base64").toString("utf8");
  }
  throw new Error("No base64 decoder available in this environment.");
}

function deriveUserId({
  attributes,
  user,
  tokens,
}: {
  attributes: Record<string, string> | null;
  user: { userId?: string; username?: string } | null;
  tokens: { idToken?: string } | null;
}) {
  if (attributes?.sub) return attributes.sub;
  if (user?.userId) return user.userId;
  if (user?.username) return user.username;

  const idToken = tokens?.idToken;
  if (!idToken) return undefined;

  try {
    const [, payload] = idToken.split(".");
    if (!payload) return undefined;
    const decoded = JSON.parse(decodeBase64Url(payload));
    if (decoded?.sub) {
      return decoded.sub as string;
    }
  } catch {
    // ignore
  }

  return undefined;
}

function formatTokenCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return Math.max(0, Math.round(parsed)).toLocaleString();
}

export function TokenBalancePill() {
  const { user, attributes, tokens, isAuthenticated, isLoading: userLoading } = useUser();
  const derivedUserId = useMemo(
    () =>
      deriveUserId({
        attributes,
        user,
        tokens,
      }),
    [attributes, tokens, user],
  );

  const [wallet, setWallet] = useState<UserWalletResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const loadWallet = useCallback(async () => {
    if (!derivedUserId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const payload = await fetchUserWallet(derivedUserId, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setWallet(payload);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("[TokenBalancePill] Unable to load wallet", err);
      setWallet(null);
      setError(err instanceof Error && err.message ? err.message : "Unable to load token balance right now.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [derivedUserId]);

  useEffect(() => {
    if (!isAuthenticated) {
      abortRef.current?.abort();
      setWallet(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (userLoading) return;
    if (!derivedUserId) {
      setWallet(null);
      setError("User identity is not available.");
      setLoading(false);
      return;
    }

    void loadWallet();
    return () => {
      abortRef.current?.abort();
    };
  }, [derivedUserId, isAuthenticated, loadWallet, userLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ wallet?: UserWalletResponse | null }>).detail;
      const payload = detail?.wallet;
      if (!payload || typeof payload !== "object") return;

      const walletUserId = typeof payload.user_id === "string" ? payload.user_id.trim() : "";
      if (derivedUserId && walletUserId && walletUserId !== derivedUserId) return;

      setWallet(payload);
      setError(null);
      setLoading(false);
    };

    window.addEventListener(USER_WALLET_UPDATED_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(USER_WALLET_UPDATED_EVENT, handler as EventListener);
    };
  }, [derivedUserId]);

  if (!isAuthenticated) return null;

  const balanceText = loading ? null : formatTokenCount(wallet?.credit_balance);
  const tooltip = error
    ? `Token balance unavailable: ${error}`
    : wallet
      ? `Token balance: ${formatTokenCount(wallet.credit_balance)}`
      : "Token balance";

  return (
    <Link
      href="/user-wallet"
      title={tooltip}
      className="group inline-flex items-center gap-2 rounded-full border border-stroke bg-white px-3 py-2 text-xs font-semibold text-dark shadow-sm transition hover:bg-gray-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:border-dark-3 dark:bg-dark-2 dark:text-white dark:hover:bg-dark-3"
    >
      <span className="inline-flex h-2 w-2 rounded-full bg-[rgb(169_240_15)]" aria-hidden />
      <span className="hidden sm:inline">Tokens</span>
      {loading ? (
        <span className="h-3 w-14 animate-pulse rounded bg-gray-2 dark:bg-dark-3" aria-hidden />
      ) : (
        <span className="tabular-nums text-[rgb(169_240_15)]">{balanceText}</span>
      )}
    </Link>
  );
}
