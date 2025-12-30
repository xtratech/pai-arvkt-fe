import { ArrowDownIcon, ArrowUpIcon } from "@/assets/icons";
import { cn } from "@/lib/utils";
import type { JSX, SVGProps } from "react";

type PropsType = {
  label: string;
  data: {
    value: number | string;
    growthRate?: number | null;
    caption?: string;
  };
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
};

export function OverviewCard({ label, data, Icon }: PropsType) {
  const hasGrowthRate =
    typeof data.growthRate === "number" && Number.isFinite(data.growthRate);
  const isDecreasing = hasGrowthRate && data.growthRate < 0;
  const growthLabel = hasGrowthRate
    ? `${Math.round(Math.abs(data.growthRate) * 10) / 10}%`
    : null;

  return (
    <div className="rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark">
      <Icon />

      <div className="mt-6 flex items-end justify-between gap-3">
        <dl>
          <dt className="mb-1.5 text-heading-6 font-bold text-dark dark:text-white">
            {data.value}
          </dt>

          <dd className="text-sm font-medium text-dark-6">{label}</dd>
        </dl>

        {hasGrowthRate ? (
          <dl
            className={cn(
              "text-sm font-medium",
              isDecreasing ? "text-red" : "text-green",
            )}
          >
            <dt className="flex items-center gap-1.5">
              {growthLabel}
              {isDecreasing ? (
                <ArrowDownIcon aria-hidden />
              ) : (
                <ArrowUpIcon aria-hidden />
              )}
            </dt>

            <dd className="sr-only">
              {label} {isDecreasing ? "Decreased" : "Increased"} by{" "}
              {growthLabel}
            </dd>
          </dl>
        ) : data.caption ? (
          <div className="text-xs font-semibold text-dark-5 dark:text-dark-6">
            {data.caption}
          </div>
        ) : null}
      </div>
    </div>
  );
}
