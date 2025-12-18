import { SessionsCard } from "./_components/sessions-card";

type PropsType = {
  searchParams: Promise<{
    selected_time_frame?: string;
  }>;
};

export default async function Home({ searchParams }: PropsType) {
  const { selected_time_frame } = await searchParams;

  return (
    <>
      {/*
      <Suspense fallback={<OverviewCardsSkeleton />}>
        <OverviewCardsGroup />
      </Suspense>
      */}

      <div className="mx-auto w-full max-w-[1460px]">
        {/*
        <PaymentsOverview
          className="col-span-12 xl:col-span-7"
          key={extractTimeFrame("payments_overview")}
          timeFrame={extractTimeFrame("payments_overview")?.split(":")[1]}
        />

        <WeeksProfit
          key={extractTimeFrame("weeks_profit")}
          timeFrame={extractTimeFrame("weeks_profit")?.split(":")[1]}
          className="col-span-12 xl:col-span-5"
        />

        <UsedDevices
          className="col-span-12 xl:col-span-5"
          key={extractTimeFrame("used_devices")}
          timeFrame={extractTimeFrame("used_devices")?.split(":")[1]}
        />

        <RegionLabels />

        <div className="col-span-12 grid xl:col-span-8">
          <Suspense fallback={<TopChannelsSkeleton />}>
            <TopChannels />
          </Suspense>
        </div>

        <Suspense fallback={null}>
          <ChatsCard />
        </Suspense>
        */}

        <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[26px] font-bold leading-[30px] text-dark dark:text-white">
            Dashboard
          </h2>
        </div>

        <div className="grid grid-cols-6 gap-6">
          <SessionsCard className="col-span-6 lg:col-span-3" />
        </div>
      </div>
    </>
  );
}
