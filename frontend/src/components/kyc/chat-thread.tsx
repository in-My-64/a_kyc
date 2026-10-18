"use client";

import { useState } from "react";
import { Send, User as UserIcon, ShieldCheck } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";

export interface ChatMessage {
  id: number;
  sender_name: string;
  is_staff: boolean;
  content: string;
  created_at: string;
}

export function ChatThread({
  trackingId,
  messages,
  currentUserIsStaff,
}: {
  trackingId: string;
  messages: ChatMessage[];
  currentUserIsStaff: boolean;
}) {
  const [content, setContent] = useState("");
  const queryClient = useQueryClient();

  const sendMessage = useMutation({
    mutationFn: async (text: string) => {
      return api.post(`workflows/${trackingId}/messages`, { content: text });
    },
    onSuccess: () => {
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["workflows", "status", trackingId] });
    },
  });

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || sendMessage.isPending) return;
    sendMessage.mutate(content);
  }

  return (
    <div className="flex flex-col h-[500px] rounded-xl border border-[var(--border)] bg-white overflow-hidden shadow-sm">
      <div className="border-b border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h3 className="font-bold flex items-center gap-2">
          <ShieldCheck className="size-4 text-[var(--primary)]" />
          Secure Message Thread
        </h3>
        <p className="text-xs text-[var(--muted)] mt-1">
          Ask questions or provide additional documents here. Do not share passwords.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-[var(--muted)] mt-10">
            No messages yet. Start the conversation below.
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.is_staff === currentUserIsStaff;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                <div className={`flex items-center gap-2 mb-1 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                  <div className="size-6 rounded-full bg-[var(--surface-hi)] grid place-items-center">
                    {msg.is_staff ? <ShieldCheck className="size-3 text-[var(--primary)]" /> : <UserIcon className="size-3 text-[var(--muted)]" />}
                  </div>
                  <span className="text-[10px] font-bold text-[var(--muted)]">{msg.sender_name}</span>
                  <span className="text-[10px] text-[var(--muted-2)]">{formatDateTime(msg.created_at)}</span>
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  isMe 
                    ? "bg-[var(--primary)] text-white rounded-tr-sm" 
                    : "bg-[var(--surface-2)] text-[var(--fg)] border border-[var(--border)] rounded-tl-sm"
                }`}>
                  {msg.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSend} className="border-t border-[var(--border)] p-3 bg-white flex gap-2">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-lg border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-[var(--primary)]"
        />
        <Button type="submit" disabled={!content.trim() || sendMessage.isPending}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
