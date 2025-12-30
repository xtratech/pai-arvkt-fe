import type { Metadata } from "next";
import { SessionsCard } from "@/app/(home)/_components/sessions-card";

export const metadata: Metadata = {
  title: "Agents",
};

export default function SessionsPage() {
  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <SessionsCard className="col-span-12" />
    </div>
  );
};
