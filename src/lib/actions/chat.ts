"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import type {
  Message,
  MessageType,
  Conversation,
  ConversationWithDetails,
  ConversationSettings,
  ChatParticipant,
  Profile,
  Job,
  JobStatus,
} from "@/lib/types";

const VALID_TYPES: MessageType[] = ["text", "image", "location", "pdf", "audio", "video"];
const MAX_BODY_LENGTH = 4000;
const MESSAGES_PER_PAGE = 50;

/** Validates the user is a participant of the given conversation. */
async function assertParticipant(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  userId: string
): Promise<{ employer_id: string; worker_id: string; job_id: string } | null> {
  const { data } = await supabase
    .from("conversations")
    .select("employer_id, worker_id, job_id")
    .eq("id", conversationId)
    .single();
  const conv = data as { employer_id: string; worker_id: string; job_id: string } | null;
  if (!conv) return null;
  if (conv.employer_id !== userId && conv.worker_id !== userId) return null;
  return conv;
}

export async function sendMessage(
  conversationId: string,
  body: string,
  type: MessageType = "text",
  attachmentUrl?: string,
  metadata?: Record<string, number | string | boolean | null>
): Promise<ActionResult & { messageId?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const conv = await assertParticipant(supabase, conversationId, user.id);
  if (!conv) return { error: "Sin permiso." };

  if (!VALID_TYPES.includes(type)) return { error: "Tipo de mensaje inválido." };

  const trimmed = body.trim();
  if (type === "text") {
    if (!trimmed) return { error: "El mensaje no puede estar vacío." };
    if (trimmed.length > MAX_BODY_LENGTH) return { error: "El mensaje es demasiado largo." };
  }
  if (type === "image" && !attachmentUrl) return { error: "Adjunto requerido." };
  if (type === "location" && (!metadata?.lat || !metadata?.lng)) {
    return { error: "Coordenadas requeridas." };
  }

  // Rate limiting via Postgres function
  const { data: rateOk, error: rateErr } = await supabase.rpc("check_message_rate_limit", {
    p_conversation_id: conversationId,
    p_sender_id: user.id,
  });
  if (!rateErr && rateOk === false) {
    return { error: "Estás enviando mensajes demasiado rápido. Espera un momento." };
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: trimmed || (type === "image" ? "📷 Imagen" : "📍 Ubicación"),
      type,
      attachment_url: attachmentUrl ?? null,
      metadata: metadata ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: "No se pudo enviar el mensaje." };
  const msg = data as unknown as { id: string };

  return { success: true, messageId: msg.id };
}

/**
 * Marca la conversación como leída hasta "ahora" para el usuario actual —
 * única fuente de verdad de lectura (Fase C4-G8.2, tras la auditoría
 * C4-G8/C4-G8.1: `messages.read_at` nunca tuvo política RLS UPDATE, así que
 * el intento de actualizarlo aquí siempre afectaba 0 filas para usuarios
 * reales; se elimina esa escritura muerta en vez de arreglar esa RLS).
 * Requiere ser participante real de la conversación — antes no se
 * verificaba, permitiendo crear/actualizar un cursor propio para una
 * conversación ajena (H5, C4-G8).
 */
export async function markRead(conversationId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const conv = await assertParticipant(supabase, conversationId, user.id);
  if (!conv) return { error: "Sin permiso." };

  const { error } = await supabase.from("conversation_read_cursors").upsert(
    { conversation_id: conversationId, profile_id: user.id, last_read_at: new Date().toISOString() },
    { onConflict: "conversation_id,profile_id" }
  );

  if (error) return { error: "No se pudo marcar como leído." };
  return { success: true };
}

export async function getMessages(
  conversationId: string,
  cursor?: string
): Promise<{ messages: Message[]; hasMore: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { messages: [], hasMore: false };

  let query = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MESSAGES_PER_PAGE + 1);

  if (cursor) query = query.lt("created_at", cursor);

  const { data } = await query;
  const rows = (data as unknown as Message[]) ?? [];
  const hasMore = rows.length > MESSAGES_PER_PAGE;

  return {
    messages: rows.slice(0, MESSAGES_PER_PAGE).reverse(),
    hasMore,
  };
}

export async function createUploadUrl(
  conversationId: string,
  fileName: string,
  contentType: string
): Promise<ActionResult & { uploadUrl?: string; publicUrl?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const conv = await assertParticipant(supabase, conversationId, user.id);
  if (!conv) return { error: "Sin permiso." };

  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!ALLOWED_TYPES.includes(contentType)) {
    return { error: "Solo se permiten imágenes JPG, PNG, GIF o WebP." };
  }

  const ext = contentType.split("/")[1] ?? "jpg";
  const path = `${conversationId}/${user.id}/${Date.now()}.${ext}`;

  // Use admin client for private bucket operations — participant check above
  // ensures authorization; service role is required to generate signed URLs.
  const admin = createAdminClient();
  const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year in seconds

  const { data: uploadData, error: uploadError } = await admin.storage
    .from("conversation-attachments")
    .createSignedUploadUrl(path);

  if (uploadError) return { error: "No se pudo preparar la subida de imagen." };

  const { data: downloadData, error: downloadError } = await admin.storage
    .from("conversation-attachments")
    .createSignedUrl(path, SIGNED_URL_TTL);

  if (downloadError) return { error: "No se pudo generar URL de descarga." };

  return {
    success: true,
    uploadUrl: uploadData.signedUrl,
    publicUrl: downloadData.signedUrl, // signed, expires in 1 year; stored as attachment_url
  };
}

export async function updateConversationSettings(
  conversationId: string,
  settings: { is_muted?: boolean; is_archived?: boolean; muted_until?: string | null }
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const conv = await assertParticipant(supabase, conversationId, user.id);
  if (!conv) return { error: "Sin permiso." };

  const { error } = await supabase.from("conversation_settings").upsert(
    {
      conversation_id: conversationId,
      profile_id: user.id,
      ...settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,profile_id" }
  );

  if (error) return { error: "No se pudo actualizar la configuración." };

  revalidatePath("/messages");
  return { success: true };
}

export async function blockConversation(conversationId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  // Only admin can block
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const typedProfile = profile as { role: string } | null;
  if (typedProfile?.role !== "admin") return { error: "Sin permiso de administrador." };

  const { error } = await supabase.from("conversation_settings").upsert(
    {
      conversation_id: conversationId,
      profile_id: user.id,
      is_blocked: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,profile_id" }
  );

  if (error) return { error: "No se pudo bloquear la conversación." };
  revalidatePath("/messages");
  return { success: true };
}

export async function getConversations(): Promise<ConversationWithDetails[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: convRows } = await supabase
    .from("conversations")
    .select("id, job_id, employer_id, worker_id, created_at")
    .or(`employer_id.eq.${user.id},worker_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (!convRows || convRows.length === 0) return [];

  const typedConvs = convRows as unknown as Conversation[];
  const convIds = typedConvs.map((c) => c.id);
  const allUserIds = [
    ...new Set([
      ...typedConvs.map((c) => c.employer_id),
      ...typedConvs.map((c) => c.worker_id),
    ]),
  ];
  const jobIds = typedConvs.map((c) => c.job_id);

  // Los otros participantes son terceros para auth.uid(): la RLS de
  // profiles (0034_harden_profiles_public_access.sql) ya no deja leer su
  // fila con el cliente de sesión. La relación ya está verificada arriba
  // (conversaciones donde participa auth.uid()), así que se usa el
  // cliente admin con la MISMA lista de columnas que ya se pedía —
  // ninguna columna nueva, nunca phone/business_ruc.
  const [
    { data: profileRows },
    { data: jobRows },
    { data: msgRows },
    { data: cursorRows },
    { data: settingRows },
  ] = await Promise.all([
    createAdminClient().from("profiles").select("id, full_name, avatar_url").in("id", allUserIds),
    supabase.from("jobs").select("id, title, status").in("id", jobIds),
    supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, type, created_at, read_at, attachment_url, metadata")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("conversation_read_cursors")
      .select("conversation_id, last_read_at")
      .eq("profile_id", user.id)
      .in("conversation_id", convIds),
    supabase
      .from("conversation_settings")
      .select("*")
      .eq("profile_id", user.id)
      .in("conversation_id", convIds),
  ]);

  const profileMap = new Map(
    (profileRows as unknown as Pick<Profile, "id" | "full_name" | "avatar_url">[] ?? []).map(
      (p) => [p.id, p]
    )
  );
  const jobMap = new Map(
    (jobRows as unknown as Pick<Job, "id" | "title" | "status">[] ?? []).map((j) => [j.id, j])
  );
  const lastMsgByConv = new Map<string, Message>();
  const msgsByConv = new Map<string, Message[]>();
  for (const msg of (msgRows as unknown as Message[]) ?? []) {
    if (!lastMsgByConv.has(msg.conversation_id)) {
      lastMsgByConv.set(msg.conversation_id, msg);
    }
    const arr = msgsByConv.get(msg.conversation_id) ?? [];
    arr.push(msg);
    msgsByConv.set(msg.conversation_id, arr);
  }
  const cursorMap = new Map(
    (
      cursorRows as unknown as { conversation_id: string; last_read_at: string }[] | null
    )?.map((c) => [c.conversation_id, c.last_read_at]) ?? []
  );
  const settingsMap = new Map(
    (settingRows as unknown as ConversationSettings[] ?? []).map((s) => [s.conversation_id, s])
  );

  const result = typedConvs.map((conv) => {
    const msgs = msgsByConv.get(conv.id) ?? [];
    // Fuente única: conversation_read_cursors (Fase C4-G8.2). Sin cursor
    // (conversación nunca abierta por este usuario), todo mensaje del otro
    // participante cuenta como no leído — ya no se consulta
    // messages.read_at, que nunca reflejó lecturas reales (ver C4-G8.1).
    const cursor = cursorMap.get(conv.id);
    const unreadCount = cursor
      ? msgs.filter((m) => m.sender_id !== user.id && m.created_at > cursor).length
      : msgs.filter((m) => m.sender_id !== user.id).length;

    return {
      ...conv,
      job: (jobMap.get(conv.job_id) as Pick<Job, "id" | "title" | "status"> | undefined) ?? null,
      employer: (profileMap.get(conv.employer_id) as Pick<Profile, "id" | "full_name" | "avatar_url"> | undefined) ?? null,
      worker: (profileMap.get(conv.worker_id) as Pick<Profile, "id" | "full_name" | "avatar_url"> | undefined) ?? null,
      last_message: lastMsgByConv.get(conv.id) ?? null,
      unread_count: unreadCount,
      settings: settingsMap.get(conv.id) ?? null,
    } satisfies ConversationWithDetails;
  });

  // Sort by last message time, most recent first
  return result.sort((a, b) => {
    const ta = a.last_message?.created_at ?? a.created_at;
    const tb = b.last_message?.created_at ?? b.created_at;
    return tb.localeCompare(ta);
  });
}

export interface HiringConversation {
  conversationId: string;
  jobId: string;
  jobTitle: string;
}

/**
 * Resuelve conversaciones EXISTENTES entre el usuario actual y otro perfil
 * (Fase C4-G6) — nunca crea una. Se usa en /workers/[workerId] y
 * /employers/[id] para ofrecer "Abrir chat" cuando ya existe una relación
 * laboral real (contratación aceptada), sin depender de que la navegación
 * traiga un jobId explícito.
 *
 * Seguridad: no se reimplementa ninguna regla de autorización nueva — se
 * apoya enteramente en `conversations_select_participant`
 * (0002_hiring_tracking.sql: `employer_id = auth.uid() or worker_id =
 * auth.uid() or admin`) usando el cliente de SESIÓN, nunca admin. El
 * filtro `.eq(employer_id/worker_id, ...)` de abajo es una optimización de
 * negocio (evita traer conversaciones irrelevantes), no el límite de
 * seguridad real: aunque se omitiera, RLS igual restringiría el resultado
 * a filas donde auth.uid() participa — un viewer nunca puede obtener el
 * conversationId de una conversación ajena por esta vía.
 *
 * "1 job = 1 conversation" (constraint `unique` en conversations.job_id,
 * 0002_hiring_tracking.sql) es lo que permite que dos usuarios con varias
 * chambas entre sí tengan varias filas aquí — nunca se elige una
 * arbitrariamente, se devuelven TODAS para que el caller decida cómo
 * mostrarlas (un solo botón vs. una lista).
 */
export async function getHiringConversations(
  targetProfileId: string
): Promise<HiringConversation[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id === targetProfileId) return [];

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (viewerProfile as { role: string } | null)?.role;

  let query = supabase.from("conversations").select("id, job_id");
  if (role === "employer") {
    query = query.eq("employer_id", user.id).eq("worker_id", targetProfileId);
  } else if (role === "worker") {
    query = query.eq("worker_id", user.id).eq("employer_id", targetProfileId);
  } else {
    // admin u otro modo activo: no es parte de la relación laboral, no
    // corresponde ofrecerle "Abrir chat" desde un perfil ajeno.
    return [];
  }

  const { data: convRows } = await query.order("created_at", { ascending: false });
  const rows = (convRows as { id: string; job_id: string }[] | null) ?? [];
  if (rows.length === 0) return [];

  const jobIds = rows.map((r) => r.job_id);
  const { data: jobRows } = await supabase.from("jobs").select("id, title").in("id", jobIds);
  const titleById = new Map(
    ((jobRows as { id: string; title: string }[] | null) ?? []).map((j) => [j.id, j.title])
  );

  return rows.map((r) => ({
    conversationId: r.id,
    jobId: r.job_id,
    jobTitle: titleById.get(r.job_id) ?? "Chamba",
  }));
}

/**
 * Resuelve el conversationId de UN job específico (Fase C4-G6) — usado por
 * AssignedWorkerCard en /jobs/[id], donde el job ya es conocido y la
 * relación "1 job = 1 conversation" (constraint unique en
 * conversations.job_id) hace innecesario cualquier resolver más genérico.
 * Mismo boundary de seguridad que el resto de este archivo: cliente de
 * sesión, RLS de `conversations_select_participant` decide qué fila es
 * visible — null tanto si no hay conversación como si el caller no es
 * participante.
 */
export async function getConversationIdForJob(jobId: string): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("conversations").select("id").eq("job_id", jobId).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function getConversationForChat(conversationId: string): Promise<{
  otherUser: ChatParticipant;
  currentUserId: string;
  initialMessages: Message[];
  initialHasMore: boolean;
  jobId: string | null;
  jobTitle: string | null;
  /** Estado real de jobs.status (Fase C4-G7B) — nunca un estado inventado para conversations. */
  jobStatus: JobStatus | null;
  /**
   * Cursor de lectura del OTRO participante (Fase C4-G8.2) — fuente única
   * para el estado "Leído" por mensaje en MessageBubble. Nunca el cursor de
   * un tercero: siempre el del participante distinto de currentUserId, en
   * ESTA conversación, protegido por `cursors_select_participant` (el
   * viewer ya es participante, RLS lo deja ver el cursor del otro). Null si
   * ese participante nunca marcó la conversación como leída.
   */
  otherParticipantLastReadAt: string | null;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const conv = await assertParticipant(supabase, conversationId, user.id);
  if (!conv) return null;

  const otherId = conv.employer_id === user.id ? conv.worker_id : conv.employer_id;

  // otherId es un tercero para auth.uid(): la RLS de profiles
  // (0034_harden_profiles_public_access.sql) ya no deja leer su fila con
  // el cliente de sesión, ni siquiera con columnas acotadas — es
  // row-level, no column-level. assertParticipant() ya verificó arriba
  // que auth.uid() es parte de esta conversación, así que se usa el
  // cliente admin con una lista blanca explícita: nunca select("*"), y
  // nunca phone/business_ruc — ChatWindow/PresenceBar (ambos Client
  // Components) reciben este objeto completo como prop.
  const [{ data: otherProfile }, { data: jobData }, { data: msgRows }, { data: cursorRow }] =
    await Promise.all([
      createAdminClient()
        .from("profiles")
        .select("id, full_name, avatar_url, role")
        .eq("id", otherId)
        .single(),
      supabase.from("jobs").select("title, status").eq("id", conv.job_id).single(),
      supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(MESSAGES_PER_PAGE + 1),
      supabase
        .from("conversation_read_cursors")
        .select("last_read_at")
        .eq("conversation_id", conversationId)
        .eq("profile_id", otherId)
        .maybeSingle(),
    ]);

  if (!otherProfile) return null;

  const rows = (msgRows as unknown as Message[]) ?? [];
  const hasMore = rows.length > MESSAGES_PER_PAGE;
  const job = jobData as unknown as { title: string; status: JobStatus } | null;

  return {
    otherUser: otherProfile as unknown as ChatParticipant,
    currentUserId: user.id,
    initialMessages: rows.slice(0, MESSAGES_PER_PAGE).reverse(),
    initialHasMore: hasMore,
    jobId: conv.job_id ?? null,
    jobTitle: job?.title ?? null,
    jobStatus: job?.status ?? null,
    otherParticipantLastReadAt: (cursorRow as { last_read_at: string } | null)?.last_read_at ?? null,
  };
}
