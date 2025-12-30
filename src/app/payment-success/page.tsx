import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Payment Success",
};

export default function PaymentSuccessPage() {
  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <Breadcrumb pageName="Payment Success" />

      <div className="rounded-[10px] border border-stroke bg-white p-8 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card">
        <div className="mx-auto flex max-w-[720px] flex-col items-center text-center">
          <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7"
              aria-hidden="true"
            >
              <path
                d="M9.00006 12.75L11.2501 15L15.0001 9.75"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-dark dark:text-white">Thanks — payment received</h1>
          <p className="mt-2 text-sm text-dark-5 dark:text-dark-6">
            Your checkout completed successfully. Credits will show up in your wallet shortly.
          </p>

          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
            >
              Back to Dashboard
            </Link>
            <Link
              href="/user-wallet"
              className="inline-flex items-center justify-center rounded-lg border border-stroke px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-dark transition hover:shadow-sm dark:border-dark-3 dark:text-white"
            >
              View Wallet
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
