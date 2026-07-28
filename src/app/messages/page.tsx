import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { getConversations } from "@/lib/actions/chat";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { ConversationItem } from "@/components/chat/ConversationItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Mensajes — Chamby",
};

export default async function MessagesPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/messages");

  const conversations = await getConversations();

  const active = conversations.filter((c) => !c.settings?.is_archived);
  const archived = conversations.filter((c) => c.settings?.is_archived);

  const totalUnread = active.reduce((sum, c) => sum + (c.settings?.is_muted ? 0 : c.unread_count), 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <div className="flex items-center gap-3">
          <h1 className="flex-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Mensajes
          </h1>
          {totalUnread > 0 && (
            <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-primary-600 px-2 text-sm font-bold text-white">
              {totalUnread}
            </span>
          )}
        </div>
        <p className="mt-1 text-ink-muted">Tus conversaciones con empleadores y trabajadores.</p>
      </Reveal>

      <div className="mt-6">
        {conversations.length === 0 ? (
          <Reveal delay={0.05}>
            <EmptyState
              pose="mail"
              title="No tienes conversaciones aún"
              description="Cuando un empleador te contrate o aceptes un trabajador, el chat se abre automáticamente aquí."
              actionLabel="Explorar trabajos"
              actionHref="/jobs"
            />
          </Reveal>
        ) : (
          <div className="space-y-0 divide-y divide-slate-100 rounded-3xl border border-slate-100 bg-white shadow-card overflow-hidden">
            {active.length === 0 && archived.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-50">
                <MessageSquare className="h-4 w-4 text-ink-muted" />
                <p className="text-xs text-ink-muted">No hay conversaciones activas</p>
              </div>
            )}

            {active.map((conv, i) => (
              <Reveal key={conv.id} delay={i * 0.03}>
                <ConversationItem conversation={conv} currentUserId={user.id} />
              </Reveal>
            ))}

            {archived.length > 0 && (
              <>
                <div className="px-4 py-2 bg-slate-50">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                    Archivadas
                  </p>
                </div>
                {archived.map((conv, i) => (
                  <Reveal key={conv.id} delay={(active.length + i) * 0.03}>
                    <ConversationItem conversation={conv} currentUserId={user.id} />
                  </Reveal>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
