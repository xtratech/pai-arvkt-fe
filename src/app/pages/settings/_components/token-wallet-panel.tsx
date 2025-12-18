"use client";

import { useCallback, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import {
  createCheckoutSession,
  createSetupIntent,
  getWalletStatus,
  updateWalletSettings,
  type UserWalletResponse,
} from "@/services/user-wallet";

const STRIPE_PUBLISHABLE_KEY = String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim();
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

function formatTokenCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return Math.max(0, Math.round(parsed)).toLocaleString();
}

function normalizeAutoTopupSettings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getAutoTopupEnabled(settings: Record<string, unknown>) {
  return Boolean(settings.enabled);
}

function getStripePaymentMethodId(settings: Record<string, unknown>) {
  const raw = settings.stripe_payment_method_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

type Props = {
  userId: string;
  wallet: UserWalletResponse | null;
  loading: boolean;
  onWalletUpdated: (wallet: UserWalletResponse) => void;
  onRefresh: () => void;
};

type SetupModalProps = {
  open: boolean;
  clientSecret: string;
  busy: boolean;
  onClose: () => void;
  onSetupConfirmed: () => Promise<void>;
};

function SetupIntentModal({ open, clientSecret, busy, onClose, onSetupConfirmed }: SetupModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-dark"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-dark dark:text-white">Add card for Auto Top-Up</h4>
            <p className="mt-1 text-sm text-dark-5 dark:text-dark-6">
              Add a payment method to enable auto top-ups.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-stroke px-3 py-1 text-xs font-semibold text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
        </div>

        <div className="mt-5">
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: "night" },
            }}
          >
            <SetupIntentForm busy={busy} onCancel={onClose} onConfirmed={onSetupConfirmed} />
          </Elements>
        </div>
      </div>
    </div>
  );
}

function SetupIntentForm({
  busy,
  onCancel,
  onConfirmed,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirmed: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const disabled = busy || submitting || !stripe || !elements;

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: typeof window !== "undefined" ? { return_url: window.location.href } : undefined,
        redirect: "if_required",
      });
      if (result.error) {
        throw new Error(result.error.message || "Unable to save payment method.");
      }

      await onConfirmed();
    } catch (err) {
      console.error("[TokenWalletPanel] Setup intent failed", err);
      setError(err instanceof Error && err.message ? err.message : "Unable to save payment method.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stroke bg-gray-1 p-4 dark:border-dark-3 dark:bg-dark-2">
        <PaymentElement />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
          onClick={onCancel}
          disabled={disabled}
        >
          Cancel
        </button>
        <button
          type="button"
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleSubmit}
          disabled={disabled}
        >
          {submitting ? "Saving..." : "Save card"}
        </button>
      </div>
    </div>
  );
}

export function TokenWalletPanel({ userId, wallet, loading, onWalletUpdated, onRefresh }: Props) {
  const [buying, setBuying] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupClientSecret, setSetupClientSecret] = useState<string>("");
  const [setupBusy, setSetupBusy] = useState(false);

  const autoTopupSettings = useMemo(
    () => normalizeAutoTopupSettings(wallet?.auto_topup_settings),
    [wallet?.auto_topup_settings],
  );
  const autoTopupEnabled = getAutoTopupEnabled(autoTopupSettings);
  const paymentMethodId = getStripePaymentMethodId(autoTopupSettings);

  const stripeConfigured = Boolean(stripePromise);

  const handleBuyCredits = useCallback(async () => {
    if (!stripeConfigured) {
      setPanelError("Stripe is not configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to enable payments.");
      return;
    }

    setBuying(true);
    setPanelError(null);
    try {
      const payload = await createCheckoutSession(userId, { quantity: 1 });
      const sessionId =
        typeof payload?.sessionId === "string" && payload.sessionId.trim()
          ? payload.sessionId.trim()
          : typeof payload?.session_id === "string" && payload.session_id.trim()
            ? payload.session_id.trim()
            : null;

      if (!sessionId) {
        throw new Error("Checkout session did not return a sessionId.");
      }

      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error("Stripe failed to initialize.");
      }

      const result = await stripe.redirectToCheckout({ sessionId });
      if (result.error) {
        throw new Error(result.error.message || "Unable to redirect to Stripe checkout.");
      }
    } catch (err) {
      console.error("[TokenWalletPanel] Buy credits failed", err);
      setPanelError(err instanceof Error && err.message ? err.message : "Unable to start checkout right now.");
    } finally {
      setBuying(false);
    }
  }, [stripeConfigured, userId]);

  const updateEnabled = useCallback(
    async (nextEnabled: boolean) => {
      setToggling(true);
      setPanelError(null);
      try {
        const updated = await updateWalletSettings(userId, {
          ...autoTopupSettings,
          enabled: nextEnabled,
        });
        onWalletUpdated(updated);
      } catch (err) {
        console.error("[TokenWalletPanel] Auto top-up update failed", err);
        setPanelError(err instanceof Error && err.message ? err.message : "Unable to update auto top-up right now.");
      } finally {
        setToggling(false);
      }
    },
    [autoTopupSettings, onWalletUpdated, userId],
  );

  const handleToggleAutoTopup = useCallback(async () => {
    if (toggling || loading) return;

    const nextEnabled = !autoTopupEnabled;
    if (!nextEnabled) {
      await updateEnabled(false);
      return;
    }

    if (!stripeConfigured) {
      setPanelError("Stripe is not configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to enable payments.");
      return;
    }

    if (paymentMethodId) {
      await updateEnabled(true);
      return;
    }

    setSetupBusy(true);
    setPanelError(null);
    try {
      const payload = await createSetupIntent(userId);
      const clientSecret =
        typeof payload?.clientSecret === "string" && payload.clientSecret.trim()
          ? payload.clientSecret.trim()
          : typeof payload?.client_secret === "string" && payload.client_secret.trim()
            ? payload.client_secret.trim()
            : null;
      if (!clientSecret) {
        throw new Error("Setup intent did not return a clientSecret.");
      }
      setSetupClientSecret(clientSecret);
      setSetupModalOpen(true);
    } catch (err) {
      console.error("[TokenWalletPanel] Create setup intent failed", err);
      setPanelError(err instanceof Error && err.message ? err.message : "Unable to start card setup right now.");
    } finally {
      setSetupBusy(false);
    }
  }, [
    autoTopupEnabled,
    loading,
    paymentMethodId,
    stripeConfigured,
    toggling,
    updateEnabled,
    userId,
  ]);

  const handleSetupConfirmed = useCallback(async () => {
    setSetupBusy(true);
    setPanelError(null);
    try {
      const start = Date.now();
      let latest: UserWalletResponse | null = null;

      while (Date.now() - start < 25_000) {
        latest = await getWalletStatus(userId);
        const latestSettings = normalizeAutoTopupSettings(latest?.auto_topup_settings);
        if (getStripePaymentMethodId(latestSettings)) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      if (latest) {
        onWalletUpdated(latest);
      }

      const withCard = latest ? getStripePaymentMethodId(normalizeAutoTopupSettings(latest.auto_topup_settings)) : null;
      if (!withCard) {
        throw new Error("Card setup is still processing. Please try again in a few seconds.");
      }

      const updated = await updateWalletSettings(userId, {
        ...normalizeAutoTopupSettings(latest?.auto_topup_settings),
        enabled: true,
      });
      onWalletUpdated(updated);
      setSetupModalOpen(false);
      setSetupClientSecret("");
    } catch (err) {
      console.error("[TokenWalletPanel] Finalize setup failed", err);
      setPanelError(err instanceof Error && err.message ? err.message : "Unable to enable auto top-up right now.");
    } finally {
      setSetupBusy(false);
    }
  }, [onWalletUpdated, userId]);

  const creditBalance = wallet?.credit_balance;
  const totalUsage = wallet?.total_usage;

  return (
    <>
      <div className="flex flex-col gap-4 rounded-xl border border-stroke bg-white p-5 dark:border-dark-3 dark:bg-dark-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
            Token Balance
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-[rgb(169_240_15)]">
            {loading ? "…" : formatTokenCount(creditBalance)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-dark-5 dark:text-dark-6">
            <span>
              Total usage:{" "}
              <span className="font-semibold tabular-nums text-dark dark:text-white">
                {loading ? "…" : formatTokenCount(totalUsage)}
              </span>
            </span>
            <button
              type="button"
              className="rounded-full border border-stroke px-3 py-1 text-xs font-semibold text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
              onClick={onRefresh}
              disabled={loading || buying || toggling || setupBusy}
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[320px]">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-stroke bg-gray-1 px-4 py-3 dark:border-dark-3 dark:bg-dark-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                Auto Top-Up
              </div>
              <div className="mt-1 text-sm font-semibold text-dark dark:text-white">
                {paymentMethodId ? "Card on file" : "No card saved"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleToggleAutoTopup()}
              disabled={loading || toggling || setupBusy}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                autoTopupEnabled ? "bg-primary" : "bg-gray-3 dark:bg-[#5A616B]"
              } ${loading || toggling || setupBusy ? "opacity-60" : "hover:opacity-90"}`}
              aria-pressed={autoTopupEnabled}
              aria-label="Toggle auto top-up"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-switch-1 transition ${
                  autoTopupEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void handleBuyCredits()}
            disabled={buying || loading}
            title={!stripeConfigured ? "Stripe is not configured." : undefined}
          >
            {buying ? "Redirecting…" : "Buy Credits"}
          </button>
          <p className="text-xs text-dark-5 dark:text-dark-6">
            Buy additional tokens, or enable auto top-ups to prevent running out.
          </p>
        </div>
      </div>

      {panelError ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {panelError}
        </div>
      ) : null}

      <SetupIntentModal
        open={setupModalOpen}
        clientSecret={setupClientSecret}
        busy={setupBusy}
        onClose={() => {
          if (setupBusy) return;
          setSetupModalOpen(false);
          setSetupClientSecret("");
        }}
        onSetupConfirmed={handleSetupConfirmed}
      />
    </>
  );
}

