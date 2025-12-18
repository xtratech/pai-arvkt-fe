import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { UserWalletSettings } from "@/app/pages/settings/_components/user-wallet-settings";

export const metadata: Metadata = {
  title: "User Wallet",
};

export default function UserWalletPage() {
  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <Breadcrumb pageName="User Wallet" />

      <div className="mt-6">
        <UserWalletSettings />
      </div>
    </div>
  );
}

