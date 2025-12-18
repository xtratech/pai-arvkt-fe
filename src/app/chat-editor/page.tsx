import type { Metadata } from "next";
import { ChatInterface } from "@/components/chat/chat-interface";

export const metadata: Metadata = {
  title: "Chat Editor",
};

export default function ChatEditorPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <ChatInterface fullHeight cardOnly enableAttribution showTrainButton />
    </div>
  );
}
