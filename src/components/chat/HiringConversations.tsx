import Link from "next/link";
import { MessageCircle } from "lucide-react";
import type { HiringConversation } from "@/lib/actions/chat";

/**
 * Renderiza "Abrir chat" hacia conversaciones EXISTENTES entre el viewer y
 * el perfil que está viendo (Fase C4-G6) — nunca crea nada, solo enlaza a
 * /messages/[conversationId]. `conversations` ya viene resuelto por
 * getHiringConversations() (src/lib/actions/chat.ts), que solo devuelve
 * filas donde el viewer autenticado es participante real (RLS).
 *
 * "1 job = 1 conversation": con más de una chamba entre las mismas dos
 * personas, se listan todas por título de chamba — nunca se elige una
 * arbitrariamente.
 */
export function HiringConversations({ conversations }: { conversations: HiringConversation[] }) {
  if (conversations.length === 0) return null;

  if (conversations.length === 1) {
    return (
      <Link
        href={`/messages/${conversations[0].conversationId}`}
        className="btn-secondary w-full justify-center"
      >
        <MessageCircle className="h-4 w-4" />
        💬 Abrir chat
      </Link>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Conversaciones</p>
      {conversations.map((c) => (
        <div
          key={c.conversationId}
          className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-2"
        >
          <span className="min-w-0 truncate text-sm text-ink">{c.jobTitle}</span>
          <Link
            href={`/messages/${c.conversationId}`}
            className="btn-secondary shrink-0 !px-3 !py-1.5 text-xs"
          >
            💬 Abrir chat
          </Link>
        </div>
      ))}
    </div>
  );
}
