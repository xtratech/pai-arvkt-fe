import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OverviewCardsGroup } from "@/app/(home)/_components/overview-cards";
import { SessionsCard } from "@/app/(home)/_components/sessions-card";

export const metadata: Metadata = {
  title: "Dashboard",
};

type DashboardPageProps = {
  searchParams?: Promise<{ payment?: string | string[] }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const resolvedSearchParams = await searchParams;
  const paymentParam = resolvedSearchParams?.payment;
  const rawPayment = Array.isArray(paymentParam) ? paymentParam[0] : paymentParam;
  const normalizedPayment = rawPayment?.toLowerCase();

  if (normalizedPayment === "success") {
    redirect("/payment-success");
  }

  if (
    normalizedPayment === "cancel" ||
    normalizedPayment === "canceled" ||
    normalizedPayment === "failed" ||
    normalizedPayment === "failure"
  ) {
    redirect("/payment-failure");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-dark dark:text-white">Dashboard</h1>
        <p className="text-sm text-dark-5 dark:text-dark-6">
          Track activity, manage agents, and jump into your latest prompts.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-dark dark:text-white">Agents</h2>
        <p className="text-sm text-dark-5 dark:text-dark-6">
          Manage your agents and jump back into recent work.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-4 md:gap-6 2xl:gap-7.5">
        <SessionsCard className="col-span-12" />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-dark dark:text-white">Token overview</h2>
        <p className="text-sm text-dark-5 dark:text-dark-6">
          Track balance, credits added, and overall usage.
        </p>
      </div>
      <OverviewCardsGroup />
    </div>
  );
}
