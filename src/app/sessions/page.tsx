import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { SessionList } from "./_components/session-list";

export const metadata: Metadata = {
  title: "Sessions Page",
};

export default function SessionsPage() {
  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <Breadcrumb pageName="Sessions" />
      <SessionList />
    </div>
  );
};