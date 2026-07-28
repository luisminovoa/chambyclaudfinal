import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Briefcase } from "lucide-react";
import { getConversationForChat } from "@/lib/actions/chat";
import { ChatWindow } from "@/components/chat/ChatWindow";

export const metadata: Metadata = {
  title: "Chat — Chamby",
};

interface Props {
  params: { conversationId: string };
}

export default async function ConversationPage({ params }: Props) {
  const data = await getConversationForChat(params.conversationId);

  if (!data) notFound();

  const { otherUser, currentUserId, initialMessages, initialHasMore, jobTitle } = data;

  if (!currentUserId) redirect(`/login?next=/messages/${params.conversationId}`);

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-2 pb-4 pt-3 sm:px-4 sm:pt-5">
      {/* Navigation header */}
      <div className="mb-3 flex items-center gap-2">
        <Link
          href="/messages"
          className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-slate-100 hover:text-ink"
          aria-label="Volver a mensajes"
        >
          <ChevronLeft className="h-4 w-4" />
          Mensajes
        </Link>
        {jobTitle && (
          <>
            <span className="text-slate-300">/</span>
            <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-ink-muted">
              <Briefcase className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{jobTitle}</span>
            </span>
          </>
        )}
      </div>

      {/* Chat area — height fills viewport minus navbar + header above */}
      <div className="h-[calc(100svh-11rem)] sm:h-[calc(100svh-7rem)]">
        <ChatWindow
          conversationId={params.conversationId}
          currentUserId={currentUserId}
          otherUser={otherUser}
          initialMessages={initialMessages}
          initialHasMore={initialHasMore}
        />
      </div>
    </div>
  );
}
