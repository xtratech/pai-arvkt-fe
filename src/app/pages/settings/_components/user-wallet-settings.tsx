"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { useUser } from "@/contexts/user-context";
import { fetchUserWallet, type UserWalletResponse } from "@/services/user-wallet";
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

function stringifySettings(settings: unknown) {
  const normalized = normalizeAutoTopup(settings);
  if (normalized === null) return "null";
  try {
    return JSON.stringify(normalized ?? {}, null, 2);
  } catch {
    return String(normalized ?? "");
  }
}

function readTrimmedString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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

function formatTimestamp(ms: number | null) {
  if (!ms) return null;
  try {
    return new Date(ms).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

function formatRelative(ms: number | null) {
  if (!ms) return null;
  const diff = Date.now() - ms;
  const seconds = Math.round(Math.abs(diff) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  const suffix = diff >= 0 ? "ago" : "from now";
  if (seconds < 45) return "just now";
  if (minutes < 60) return `${minutes}m ${suffix}`;
  if (hours < 24) return `${hours}h ${suffix}`;
  return `${days}d ${suffix}`;
}

function formatCurrencyFromCents(amountCents: unknown, currencyCode: unknown) {
  const cents = Number(amountCents);
  if (!Number.isFinite(cents)) return null;
  const normalizedCurrency =
    typeof currencyCode === "string" && currencyCode.trim() ? currencyCode.trim().toUpperCase() : null;

  const amount = cents / 100;
  if (!normalizedCurrency) {
    return `$${amount.toFixed(2)}`;
  }

  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: normalizedCurrency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalizedCurrency}`;
  }
}

function prettyTransactionType(type: unknown) {
  const raw = typeof type === "string" ? type.trim() : "";
  if (!raw) return "Transaction";
  const normalized = raw.toLowerCase();
  if (normalized === "manual_buy") return "Manual purchase";
  if (normalized === "auto_topup") return "Auto top-up";
  if (normalized === "tokens_spent") return "Usage";
  if (normalized === "usage") return "Usage";
  if (normalized === "train_llm") return "Train LLM";
  return raw
    .split("_")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
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
  const [error, setError] = useState<string | null>(null);
  const [showTransactions, setShowTransactions] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [autoTopupCopied, setAutoTopupCopied] = useState(false);
  const [copiedTransactionValue, setCopiedTransactionValue] = useState<string | null>(null);
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);

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
      setWallet(payload);
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "AbortError" || controller.signal.aborted) return;
      console.error("[UserWalletSettings] Unable to load wallet", err);
      setWallet(null);
      setError(err instanceof Error && err.message ? err.message : "Unable to load wallet right now.");
    } finally {
      setLoading(false);
    }
  }, [derivedUserId]);

  useEffect(() => {
    if (!isAuthenticated) {
      setWallet(null);
      setError(null);
      return;
    }
    if (!derivedUserId || userLoading) return;
    void loadWallet();
    return () => {
      abortRef.current?.abort();
    };
  }, [derivedUserId, isAuthenticated, loadWallet, userLoading]);

  const creditBalance = wallet?.credit_balance;
  const totalUsage = wallet?.total_usage;
  const transactions = useMemo(
    () => (Array.isArray(wallet?.transactions) ? wallet?.transactions : []),
    [wallet?.transactions],
  );
  const autoTopupSettings = normalizeAutoTopup(wallet?.auto_topup_settings);
  const autoTopupJson = useMemo(
    () => stringifySettings(wallet?.auto_topup_settings),
    [wallet?.auto_topup_settings],
  );
  const autoTopupObj = useMemo(() => {
    if (!autoTopupSettings || typeof autoTopupSettings !== "object" || Array.isArray(autoTopupSettings)) {
      return null;
    }
    return autoTopupSettings as Record<string, unknown>;
  }, [autoTopupSettings]);

  const autoTopupEnabled = autoTopupObj ? Boolean(autoTopupObj.enabled) : null;
  const autoTopupThreshold = autoTopupObj?.threshold;
  const autoTopupAmount = autoTopupObj?.amount;
  const stripeCustomerId = readTrimmedString(autoTopupObj?.stripe_customer_id);
  const stripePaymentMethodId = readTrimmedString(autoTopupObj?.stripe_payment_method_id);

  const handleCopyAutoTopupJson = useCallback(async () => {
    setAutoTopupCopied(false);
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard is not available.");
      }
      await navigator.clipboard.writeText(autoTopupJson);
      setAutoTopupCopied(true);
      window.setTimeout(() => setAutoTopupCopied(false), 1500);
    } catch (err) {
      console.error("[UserWalletSettings] Copy failed", err);
      setError("Unable to copy to clipboard. Please select the text and copy manually.");
    }
  }, [autoTopupJson]);

  const handleCopyTransactionField = useCallback(async (value: string) => {
    setCopiedTransactionValue(null);
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard is not available.");
      }
      await navigator.clipboard.writeText(value);
      setCopiedTransactionValue(value);
      window.setTimeout(() => setCopiedTransactionValue(null), 1500);
    } catch (err) {
      console.error("[UserWalletSettings] Copy transaction field failed", err);
      setError("Unable to copy to clipboard. Please copy it manually.");
    }
  }, []);

  const transactionRows = useMemo(() => {
    const rows = transactions
      .map((tx, index) => {
        const record = tx as Record<string, unknown>;
        const createdAtMs = toEpochMs(record.created_at);
        const typeRaw = typeof record.type === "string" ? record.type : null;

        const tokensAdded = Number(record.tokens_added);
        const tokensSpent = Number(record.tokens_spent);
        const safeTokensAdded = Number.isFinite(tokensAdded) ? Math.max(0, Math.round(tokensAdded)) : 0;
        const safeTokensSpent = Number.isFinite(tokensSpent) ? Math.max(0, Math.round(tokensSpent)) : 0;
        const tokenDelta = safeTokensAdded || safeTokensSpent ? safeTokensAdded - safeTokensSpent : null;

        const currency = readTrimmedString(record.currency);
        const chargeText = formatCurrencyFromCents(record.charge_amount_cents, currency);

        const stripeCustomerId = readTrimmedString(record.stripe_customer_id);
        const stripePaymentIntentId = readTrimmedString(record.stripe_payment_intent_id);
        const stripeCheckoutSessionId = readTrimmedString(record.stripe_checkout_session_id);
        const stripePaymentMethodId = readTrimmedString(record.stripe_payment_method_id);

        const id =
          stripePaymentIntentId ??
          stripeCheckoutSessionId ??
          (createdAtMs ? `${createdAtMs}-${index}` : `tx-${index}`);

        return {
          id,
          raw: tx,
          createdAtMs,
          createdAtLabel: formatTimestamp(createdAtMs),
          relativeLabel: formatRelative(createdAtMs),
          typeRaw,
          typeLabel: prettyTransactionType(typeRaw),
          tokensAdded: safeTokensAdded || null,
          tokensSpent: safeTokensSpent || null,
          tokenDelta,
          chargeText,
          stripeCustomerId,
          stripePaymentIntentId,
          stripeCheckoutSessionId,
          stripePaymentMethodId,
        };
      })
      .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));

    const totals = rows.reduce(
      (acc, row) => {
        acc.tokensAdded += row.tokensAdded ?? 0;
        acc.tokensSpent += row.tokensSpent ?? 0;
        const cents = Number((row.raw as Record<string, unknown>)?.charge_amount_cents);
        if (Number.isFinite(cents)) acc.chargeCents += Math.max(0, Math.round(cents));
        return acc;
      },
      { tokensAdded: 0, tokensSpent: 0, chargeCents: 0 },
    );

    return { rows, totals };
  }, [transactions]);

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
              <div className="flex items-center justify-between gap-3 rounded-xl border border-stroke bg-gray-1 px-4 py-3 dark:border-dark-3 dark:bg-dark-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                    Auto Top-Up Settings
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-dark dark:text-white">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      Read-only
                    </span>
                    {autoTopupEnabled !== null ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          autoTopupEnabled
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300"
                            : "bg-gray-2 text-dark dark:bg-dark-2 dark:text-dark-6"
                        }`}
                      >
                        {autoTopupEnabled ? "Enabled" : "Disabled"}
                      </span>
                    ) : null}
                    {stripePaymentMethodId ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        Card on file
                      </span>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleCopyAutoTopupJson()}
                  className="rounded-lg border border-stroke px-3 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-2"
                  disabled={!derivedUserId || loading}
                >
                  {autoTopupCopied ? "Copied" : "Copy JSON"}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-stroke bg-white px-4 py-3 dark:border-dark-3 dark:bg-dark-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                    Threshold
                  </div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-dark dark:text-white">
                    {loading ? "…" : formatTokenCount(autoTopupThreshold)}
                  </div>
                </div>
                <div className="rounded-xl border border-stroke bg-white px-4 py-3 dark:border-dark-3 dark:bg-dark-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                    Top-up Amount
                  </div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-dark dark:text-white">
                    {loading ? "…" : formatTokenCount(autoTopupAmount)}
                  </div>
                </div>
                <div className="rounded-xl border border-stroke bg-white px-4 py-3 dark:border-dark-3 dark:bg-dark-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                    Stripe Customer
                  </div>
                  <div
                    className="mt-1 truncate text-sm font-semibold text-dark dark:text-white"
                    title={stripeCustomerId ?? undefined}
                  >
                    {loading ? "…" : stripeCustomerId ?? "—"}
                  </div>
                </div>
                <div className="rounded-xl border border-stroke bg-white px-4 py-3 dark:border-dark-3 dark:bg-dark-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                    Payment Method
                  </div>
                  <div
                    className="mt-1 truncate text-sm font-semibold text-dark dark:text-white"
                    title={stripePaymentMethodId ?? undefined}
                  >
                    {loading ? "…" : stripePaymentMethodId ?? "—"}
                  </div>
                </div>
              </div>

              <pre className="custom-scrollbar max-h-64 overflow-auto rounded-xl border border-stroke bg-white p-4 font-mono text-xs text-dark dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
{autoTopupJson}
              </pre>

              <p className="text-xs text-dark-5 dark:text-dark-6">
                Use the wallet controls above (Auto Top-Up toggle / checkout) to make changes. This view is a read-only snapshot for debugging.
              </p>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <div className="rounded-lg border border-stroke bg-white p-4 dark:border-dark-3 dark:bg-dark-2">
          <button
            type="button"
            onClick={() => setShowTransactions((prev) => !prev)}
            className="flex w-full items-center justify-between text-sm font-semibold text-dark dark:text-white"
          >
            <span>Transaction History</span>
            <span className="text-xs font-semibold text-dark-5 dark:text-dark-6">
              {loading ? "…" : `${formatTokenCount(transactions.length)} records`} ·{" "}
              {showTransactions ? "Hide" : "Show"}
            </span>
          </button>
          {showTransactions ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-stroke bg-white px-4 py-3 dark:border-dark-3 dark:bg-dark-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                    Tokens added
                  </div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-dark dark:text-white">
                    {loading ? "…" : formatTokenCount(transactionRows.totals.tokensAdded)}
                  </div>
                </div>
                <div className="rounded-xl border border-stroke bg-white px-4 py-3 dark:border-dark-3 dark:bg-dark-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                    Tokens spent
                  </div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-dark dark:text-white">
                    {loading ? "…" : formatTokenCount(transactionRows.totals.tokensSpent)}
                  </div>
                </div>
                <div className="rounded-xl border border-stroke bg-white px-4 py-3 dark:border-dark-3 dark:bg-dark-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                    Total charged
                  </div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-dark dark:text-white">
                    {loading
                      ? "…"
                      : formatCurrencyFromCents(transactionRows.totals.chargeCents, "USD") ?? "—"}
                  </div>
                </div>
              </div>

              {transactionRows.rows.length ? (
                <div className="space-y-3">
                  {transactionRows.rows.map((row) => {
                    const delta = row.tokenDelta;
                    const deltaAbs = delta === null ? null : Math.abs(delta);
                    const deltaSign = delta === null ? "" : delta > 0 ? "+" : delta < 0 ? "-" : "";
                    const deltaClass =
                      delta === null
                        ? "text-dark dark:text-white"
                        : delta > 0
                          ? "text-[rgb(169_240_15)]"
                          : delta < 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-dark dark:text-white";

                    const showDetails = expandedTransactionId === row.id;

                    const typeTone = (row.typeRaw ?? "").toLowerCase();
                    const typeBadgeClass =
                      typeTone === "manual_buy"
                        ? "bg-primary/10 text-primary"
                        : typeTone === "auto_topup"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300"
                          : typeTone === "usage" || typeTone === "tokens_spent"
                            ? "bg-gray-2 text-dark dark:bg-dark-3 dark:text-dark-6"
                            : "bg-gray-2 text-dark dark:bg-dark-3 dark:text-dark-6";

                    return (
                      <div
                        key={row.id}
                        className="rounded-xl border border-stroke bg-white px-4 py-4 shadow-sm dark:border-dark-3 dark:bg-dark-2"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeBadgeClass}`}
                              >
                                {row.typeLabel}
                              </span>
                              {row.createdAtLabel ? (
                                <span className="text-xs text-dark-5 dark:text-dark-6">
                                  {row.createdAtLabel}
                                </span>
                              ) : null}
                              {row.relativeLabel ? (
                                <span className="text-xs text-dark-5 dark:text-dark-6">
                                  ({row.relativeLabel})
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-2 flex flex-wrap items-end gap-4">
                              {deltaAbs !== null ? (
                                <div className={`text-lg font-bold tabular-nums ${deltaClass}`}>
                                  {deltaSign}
                                  {formatTokenCount(deltaAbs)} tokens
                                </div>
                              ) : (
                                <div className="text-sm font-semibold text-dark dark:text-white">
                                  Token change
                                </div>
                              )}
                              {row.chargeText ? (
                                <div className="text-sm font-semibold text-dark dark:text-white">
                                  Charged {row.chargeText}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-lg border border-stroke px-3 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                            onClick={() => setExpandedTransactionId(showDetails ? null : row.id)}
                          >
                            {showDetails ? "Hide details" : "View details"}
                          </button>
                        </div>

                        {showDetails ? (
                          <div className="mt-4 space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {(
                                [
                                  ["Payment intent", row.stripePaymentIntentId],
                                  ["Checkout session", row.stripeCheckoutSessionId],
                                  ["Payment method", row.stripePaymentMethodId],
                                  ["Customer", row.stripeCustomerId],
                                ] as const
                              )
                                .filter(([, value]) => Boolean(value))
                                .map(([label, value]) => {
                                  const idValue = value as string;
                                  return (
                                    <div
                                      key={`${row.id}-${label}`}
                                      className="flex items-center gap-2 rounded-full border border-stroke bg-gray-1 px-3 py-1 text-xs dark:border-dark-3 dark:bg-dark-3"
                                    >
                                      <span className="font-semibold text-dark-5 dark:text-dark-6">{label}</span>
                                      <span
                                        className="max-w-[220px] truncate font-mono text-[11px] text-dark dark:text-white"
                                        title={idValue}
                                      >
                                        {idValue}
                                      </span>
                                      <button
                                        type="button"
                                        className="font-semibold text-primary transition hover:underline"
                                        onClick={() => void handleCopyTransactionField(idValue)}
                                      >
                                        {copiedTransactionValue === idValue ? "Copied" : "Copy"}
                                      </button>
                                    </div>
                                  );
                                })}
                            </div>

                            <pre className="custom-scrollbar max-h-72 overflow-auto rounded-xl border border-stroke bg-white p-4 text-xs text-dark dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
{JSON.stringify(row.raw, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-stroke bg-white px-4 py-3 text-sm text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
                  No transactions yet.
                </div>
              )}
            </div>
          ) : null}
        </div>
        </div>
      </ShowcaseSection>
    </section>
  );
}
