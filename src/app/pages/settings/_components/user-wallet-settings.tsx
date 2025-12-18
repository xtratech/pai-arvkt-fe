"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { useUser } from "@/contexts/user-context";
import {
  fetchUserWallet,
  updateUserWalletAutoTopup,
  type UserWalletResponse,
} from "@/services/user-wallet";
import { TokenWalletPanel } from "./token-wallet-panel";

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

function formatMoney(value: unknown) {
  return formatTokenCount(value);
}

function normalizeAutoTopup(settings: unknown) {
  if (settings === null || typeof settings === "undefined") {
    return null;
  }
  if (typeof settings === "object") {
    return settings as Record<string, unknown>;
  }
  return settings;
}

export function UserWalletSettings() {
  const { user, attributes, tokens, isLoading: userLoading, isAuthenticated } = useUser();
  const derivedUserId = useMemo(
    () =>
      deriveUserId({
        attributes,
        user,
        tokens,
      }),
    [attributes, user, tokens],
  );

  const [wallet, setWallet] = useState<UserWalletResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [autoTopupText, setAutoTopupText] = useState<string>("{}");
  const [initialAutoTopupText, setInitialAutoTopupText] = useState<string>("{}");
  const [showTransactions, setShowTransactions] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const isDirty = useMemo(() => autoTopupText !== initialAutoTopupText, [autoTopupText, initialAutoTopupText]);

  const syncAutoTopup = useCallback((payload: UserWalletResponse | null) => {
    const normalized = normalizeAutoTopup(payload?.auto_topup_settings);
    const text = normalized === null ? "null" : JSON.stringify(normalized ?? {}, null, 2);
    setAutoTopupText(text);
    setInitialAutoTopupText(text);
  }, []);

  const loadWallet = useCallback(async () => {
    if (!derivedUserId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = await fetchUserWallet(derivedUserId, { signal: controller.signal });
      setWallet(payload);
      syncAutoTopup(payload);
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "AbortError" || controller.signal.aborted) return;
      console.error("[UserWalletSettings] Unable to load wallet", err);
      setWallet(null);
      setError(err instanceof Error && err.message ? err.message : "Unable to load wallet right now.");
    } finally {
      setLoading(false);
    }
  }, [derivedUserId, syncAutoTopup]);

  useEffect(() => {
    if (!isAuthenticated) {
      setWallet(null);
      setError(null);
      setSuccess(null);
      return;
    }
    if (!derivedUserId || userLoading) return;
    void loadWallet();
    return () => {
      abortRef.current?.abort();
    };
  }, [derivedUserId, isAuthenticated, loadWallet, userLoading]);

  const handleReset = useCallback(() => {
    setAutoTopupText(initialAutoTopupText);
    setError(null);
    setSuccess(null);
  }, [initialAutoTopupText]);

  const handleSave = useCallback(async () => {
    if (!derivedUserId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(autoTopupText);
      } catch (parseError) {
        throw new Error("Auto top-up settings must be valid JSON.");
      }

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("'auto_topup_settings' must be a non-empty object.");
      }
      if (Object.keys(parsed as Record<string, unknown>).length === 0) {
        throw new Error("'auto_topup_settings' must be a non-empty object.");
      }

      const updated = await updateUserWalletAutoTopup(derivedUserId, parsed);
      setWallet(updated);
      syncAutoTopup(updated);
      setSuccess("Wallet settings updated.");
    } catch (err) {
      console.error("[UserWalletSettings] Save failed", err);
      setError(err instanceof Error && err.message ? err.message : "Unable to save wallet settings right now.");
    } finally {
      setSaving(false);
    }
  }, [autoTopupText, derivedUserId, syncAutoTopup]);

  const creditBalance = wallet?.credit_balance;
  const totalUsage = wallet?.total_usage;
  const transactions = Array.isArray(wallet?.transactions) ? wallet?.transactions : [];

  return (
    <section id="user-wallet" className="scroll-mt-28">
      <ShowcaseSection title="User Wallet" className="!p-7">
        <div className="space-y-6">
        {!derivedUserId && !userLoading ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
            Unable to resolve your user id. Please sign in again.
          </div>
        ) : null}

        {derivedUserId ? (
          <TokenWalletPanel
            userId={derivedUserId}
            wallet={wallet}
            loading={loading}
            onWalletUpdated={(updated) => {
              setWallet(updated);
              syncAutoTopup(updated);
            }}
            onRefresh={() => void loadWallet()}
          />
        ) : (
          <div className="rounded-lg border border-stroke bg-white px-4 py-3 text-sm text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
            Sign in to view your wallet.
          </div>
        )}

        {/* <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-stroke bg-white px-4 py-3 dark:border-dark-3 dark:bg-dark-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
              Credit Balance
            </div>
            <div className="mt-1 text-lg font-semibold text-dark dark:text-white">
              {loading ? "…" : formatMoney(creditBalance)}
            </div>
          </div>
          <div className="rounded-lg border border-stroke bg-white px-4 py-3 dark:border-dark-3 dark:bg-dark-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
              Total Usage
            </div>
            <div className="mt-1 text-lg font-semibold text-dark dark:text-white">
              {loading ? "…" : formatMoney(totalUsage)}
            </div>
          </div>
          <div className="rounded-lg border border-stroke bg-white px-4 py-3 dark:border-dark-3 dark:bg-dark-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
              Transactions
            </div>
            <div className="mt-1 text-lg font-semibold text-dark dark:text-white">
              {loading ? "…" : String(transactions.length)}
            </div>
          </div>
        </div> */}

        <div className="rounded-lg border border-stroke bg-white p-4 dark:border-dark-3 dark:bg-dark-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="flex w-full items-center justify-between text-sm font-semibold text-dark dark:text-white"
          >
            <span>Advanced Settings</span>
            <span className="text-xs font-semibold text-dark-5 dark:text-dark-6">
              {showAdvanced ? "Hide" : "Show"}
            </span>
          </button>
          {showAdvanced ? (
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="auto-topup-settings">
                  Auto Top-up Settings (JSON)
                </label>
                <textarea
                  id="auto-topup-settings"
                  value={autoTopupText}
                  onChange={(event) => setAutoTopupText(event.target.value)}
                  className="custom-scrollbar h-48 w-full resize-none rounded-lg border border-stroke bg-white px-3 py-2 font-mono text-xs text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  disabled={loading || saving || !derivedUserId}
                  placeholder={'{\n  "enabled": true\n}'}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-stroke px-6 py-[7px] font-medium text-dark hover:shadow-1 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white"
                  onClick={handleReset}
                  disabled={loading || saving || !isDirty}
                >
                  Reset
                </button>

                <div className="ml-auto flex gap-3">
                  <button
                    type="button"
                    className="rounded-lg bg-primary px-6 py-[7px] font-medium text-gray-2 hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleSave}
                    disabled={loading || saving || !isDirty || !derivedUserId}
                  >
                    Save
                    {saving ? (
                      <span className="ml-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-t-transparent" />
                    ) : null}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">
            {success}
          </div>
        ) : null}

        <div className="rounded-lg border border-stroke bg-white p-4 dark:border-dark-3 dark:bg-dark-2">
          <button
            type="button"
            onClick={() => setShowTransactions((prev) => !prev)}
            className="flex w-full items-center justify-between text-sm font-semibold text-dark dark:text-white"
          >
            <span>Transaction Details</span>
            <span className="text-xs font-semibold text-dark-5 dark:text-dark-6">
              {loading ? "…" : `${formatTokenCount(transactions.length)} records`} · {showTransactions ? "Hide" : "Show"}
            </span>
          </button>
          {showTransactions ? (
            <pre className="custom-scrollbar mt-3 max-h-64 overflow-auto rounded-lg bg-gray-2 p-3 text-xs text-dark dark:bg-dark-3 dark:text-dark-6">
{JSON.stringify(transactions, null, 2)}
            </pre>
          ) : null}
        </div>
        </div>
      </ShowcaseSection>
    </section>
  );
}
