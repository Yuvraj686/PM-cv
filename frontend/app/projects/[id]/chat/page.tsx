'use client';

import { ChatWindow } from '@/components/chat/ChatWindow';

export default function ChatPage() {
  // We'll rely on ChatWindow to handle the layout for simplicity
  return (
    <div className="h-full w-full overflow-hidden">
      <ChatWindow />
    </div>
  );
}
