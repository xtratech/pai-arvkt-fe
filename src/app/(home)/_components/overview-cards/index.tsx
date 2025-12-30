"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/contexts/user-context";
import {
  fetchUserWallet,
  USER_WALLET_UPDATED_EVENT,
  type UserWalletResponse,
} from "@/services/user-wallet";
import { OverviewCard } from "./card";
import * as icons from "./icons";

const WINDOW_DAYS = 30;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

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

function toEpochMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      return asNumber < 10_000_000_000 ? asNumber * 1000 : asNumber;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseTokenValue(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function formatTokenCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "N/A";
  return Math.max(0, Math.round(parsed)).toLocaleString();
}

function calculateGrowthRate(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function OverviewCardsGroup() {
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
      console.error("[OverviewCardsGroup] Unable to load wallet", err);
      setWallet(null);
      setError(
        err instanceof Error && err.message ? err.message : "Unable to load wallet right now.",
      );
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

  const transactions = useMemo(
    () => (Array.isArray(wallet?.transactions) ? wallet?.transactions : []),
    [wallet?.transactions],
  );

  const metrics = useMemo(() => {
    const now = Date.now();
    const currentStart = now - WINDOW_MS;
    const previousStart = currentStart - WINDOW_MS;

    let currentAdded = 0;
    let currentSpent = 0;
    let previousAdded = 0;
    let previousSpent = 0;
    let totalSpent = 0;

    for (const tx of transactions) {
      const record = tx as Record<string, unknown>;
      const added = parseTokenValue(record.tokens_added);
      const spent = parseTokenValue(record.tokens_spent);
      totalSpent += spent;

      const createdAtMs = toEpochMs(record.created_at);
      if (!createdAtMs) continue;

      if (createdAtMs >= currentStart && createdAtMs <= now) {
        currentAdded += added;
        currentSpent += spent;
      } else if (createdAtMs >= previousStart && createdAtMs < currentStart) {
        previousAdded += added;
        previousSpent += spent;
      }
    }

    return {
      currentAdded,
      currentSpent,
      previousAdded,
      previousSpent,
      totalSpent,
    };
  }, [transactions]);

  const totalUsageValue = useMemo(() => {
    const raw = Number(wallet?.total_usage);
    if (Number.isFinite(raw)) return Math.max(0, Math.round(raw));
    return metrics.totalSpent;
  }, [metrics.totalSpent, wallet?.total_usage]);

  const fallbackValue = loading || userLoading ? "..." : "N/A";
  const fallbackCaption = !isAuthenticated
    ? "Sign in to view"
    : error
      ? "Unavailable"
      : loading || userLoading
        ? "Loading"
        : "No data";

  const showFallback = !isAuthenticated || userLoading || loading || Boolean(error) || !wallet;

  const tokenBalanceValue = showFallback
    ? fallbackValue
    : formatTokenCount(wallet?.credit_balance);
  const tokensUsedValue = showFallback
    ? fallbackValue
    : formatTokenCount(metrics.currentSpent);
  const tokensAddedValue = showFallback
    ? fallbackValue
    : formatTokenCount(metrics.currentAdded);
  const totalUsageText = showFallback ? fallbackValue : formatTokenCount(totalUsageValue);

  const tokensUsedGrowth = showFallback
    ? null
    : calculateGrowthRate(metrics.currentSpent, metrics.previousSpent);
  const tokensAddedGrowth = showFallback
    ? null
    : calculateGrowthRate(metrics.currentAdded, metrics.previousAdded);

  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4 2xl:gap-7.5">
      <OverviewCard
        label="Token Balance"
        data={{
          value: tokenBalanceValue,
          caption: showFallback ? fallbackCaption : "Current balance",
        }}
        Icon={icons.Profit}
      />

      <OverviewCard
        label="Tokens Used (30d)"
        data={
          showFallback
            ? { value: tokensUsedValue, caption: fallbackCaption }
            : tokensUsedGrowth === null
              ? { value: tokensUsedValue, caption: "Last 30d" }
              : { value: tokensUsedValue, growthRate: tokensUsedGrowth }
        }
        Icon={icons.Views}
      />

      <OverviewCard
        label="Tokens Added (30d)"
        data={
          showFallback
            ? { value: tokensAddedValue, caption: fallbackCaption }
            : tokensAddedGrowth === null
              ? { value: tokensAddedValue, caption: "Last 30d" }
              : { value: tokensAddedValue, growthRate: tokensAddedGrowth }
        }
        Icon={icons.Product}
      />

      <OverviewCard
        label="Total Usage"
        data={{
          value: totalUsageText,
          caption: showFallback ? fallbackCaption : "All time",
        }}
        Icon={icons.Users}
      />
    </div>
  );
}
