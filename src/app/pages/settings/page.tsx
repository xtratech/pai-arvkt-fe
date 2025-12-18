import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { UploadPhotoForm } from "./_components/upload-photo";
import { TargetChatbotSettingsForm } from "./_components/target-chatbot-settings";
import { UserWalletSettings } from "./_components/user-wallet-settings";

export const metadata: Metadata = {
  title: "Settings Page",
};

export default function SettingsPage() { 
  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <Breadcrumb pageName="Settings" />

      <div className="grid grid-cols-5 gap-8">
        <div className="col-span-5 space-y-8 xl:col-span-3">
          <TargetChatbotSettingsForm />
          <UserWalletSettings />
        </div>
        <div className="col-span-5 xl:col-span-2">
          <UploadPhotoForm />
        </div>
      </div>
    </div>
  );
};
