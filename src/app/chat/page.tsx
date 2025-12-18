import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { ChatInterface } from "@/components/chat/chat-interface";

export const metadata: Metadata = {
  title: "Chat Playground",
};

export default function ChatPage() {
  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <Breadcrumb pageName="Chat Playground" />

      <div className="mt-6">
        <ChatInterface />
      </div>
    </div>
  );
}

