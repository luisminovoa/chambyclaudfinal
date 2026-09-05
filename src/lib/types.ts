export type UserRole = "worker" | "employer" | "admin";
export type JobStatus = "abierto" | "en_progreso" | "completado" | "cancelado";
export type ApplicationStatus = "pendiente" | "aceptado" | "rechazado" | "retirado";
export type PayType = "por_hora" | "por_dia" | "fijo";

// Identidad empresarial del empleador (0030, Entrega 1)
export type EmployerType = "individual" | "company";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  city: string | null;
  category: string | null;
  skills: string[];
  bio: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Identidad empresarial del empleador (0030) — nullable, no aplica a
  // worker. `business_ruc` es solo el RUC DECLARADO por el propio
  // empleador, nunca una fuente de verificación (ver verification_documents
  // + badge `ruc_active` en src/lib/badge-config.ts).
  employer_type: EmployerType | null;
  business_name: string | null;
  business_sector: string | null;
  business_description: string | null;
  business_ruc: string | null;
  district: string | null;
  // Ubicación jerárquica Perú (Fase 1, ver src/lib/ubigeo.ts) — nullable:
  // `city` sigue siendo la fuente de verdad para perfiles que aún no
  // guardaron con el nuevo LocationSelector.
  department: string | null;
  province: string | null;
}

/**
 * Proyección pública mínima de un trabajador/empleador para tarjetas y
 * listados de terceros (ApplicantRow, AssignedWorkerCard, "Empleadores
 * destacados"). Exactamente los campos que esos componentes leen — nunca
 * phone/business_ruc. No confundir con PublicProfileView (las 12 columnas
 * completas de public.public_profiles, 0034_harden_profiles_public_access.sql).
 */
export type PublicWorkerSummary = Pick<Profile, "id" | "full_name" | "avatar_url" | "category" | "city">;

/**
 * Perfil de trabajador para "Ver perfil" (getWorkerPublicProfile(), Fase 2
 * del directorio de trabajadores) — mismas columnas que expone
 * public.public_workers (0037_public_workers_directory.sql), nunca phone/
 * role/is_active/updated_at. El viewer puede ser el propio trabajador, un
 * admin, un empleador con relación de postulación, o cualquier empleador
 * autenticado consultando a un trabajador activo — ninguno de esos casos
 * necesita más columnas que estas para renderizar WorkerPublicProfileView.
 */
export type WorkerDiscoveryProfile = Pick<
  Profile,
  | "id"
  | "full_name"
  | "avatar_url"
  | "city"
  | "category"
  | "skills"
  | "bio"
  | "created_at"
  | "department"
  | "province"
  | "district"
>;

/**
 * Subconjunto seguro de worker_profile_details para el mismo flujo —
 * nunca whatsapp/birth_date/address/district/work_radius_km, sea cual sea
 * el viewer autorizado.
 */
export type WorkerDiscoveryDetails = Pick<
  WorkerProfileDetails,
  "professional_title" | "availability" | "years_experience" | "hourly_rate" | "daily_rate" | "languages"
>;

/**
 * Una fila del directorio de trabajadores (Fase 3) — exactamente las 13
 * columnas de public.public_workers (0037_public_workers_directory.sql)
 * más el resumen de calificación (rating_summary, ya pública desde
 * 0001_init.sql, resuelta aparte porque no vive en la vista). Nunca
 * phone/whatsapp/birth_date/address/district: esas columnas no existen
 * en public_workers, así que ni siquiera pueden pedirse por error.
 */
export interface PublicWorkerListing {
  id: string;
  full_name: string;
  avatar_url: string | null;
  city: string | null;
  category: string | null;
  skills: string[];
  bio: string | null;
  created_at: string;
  professional_title: string | null;
  availability: AvailabilityStatus | null;
  years_experience: number | null;
  hourly_rate: number | null;
  daily_rate: number | null;
  // Ubicación jerárquica Perú (Fase 6, C4-G18) — de public.profiles vía
  // public_workers (0042_public_workers_hierarchical_location.sql), al
  // final de la lista de columnas para no romper CREATE OR REPLACE VIEW.
  // Nullable: `city` sigue siendo el fallback de presentación (ver
  // src/lib/location.ts) para filas que aún no guardaron con
  // LocationSelector.
  department: string | null;
  province: string | null;
  district: string | null;
  ratingSummary: RatingSummary | null;
  /** Trabajos completados (jobs.status='completado'), siempre numérico — 0 si no hay ninguno. Fase C4-G3. */
  jobsCompleted: number;
}

/** Filtros aceptados por listPublicWorkers() (src/lib/actions/workers.ts). */
export interface WorkerDirectoryFilters {
  category?: string;
  city?: string;
  availability?: AvailabilityStatus;
  q?: string;
  // Ubicación jerárquica Perú (Fase 6, C4-G18) — cada nivel se aplica con
  // .eq() exacto, nunca ilike/fuzzy, y conviven con `city` (compatibilidad
  // legacy, ver src/lib/location.ts).
  department?: string;
  province?: string;
  district?: string;
}

/**
 * Proyección pública completa — exactamente las columnas de
 * public.public_profiles (0034_harden_profiles_public_access.sql). Nunca
 * incluye phone, business_ruc, role, is_active, district ni updated_at.
 */
export interface PublicProfileView {
  id: string;
  full_name: string;
  avatar_url: string | null;
  city: string | null;
  category: string | null;
  skills: string[];
  bio: string | null;
  created_at: string;
  employer_type: EmployerType | null;
  business_name: string | null;
  business_sector: string | null;
  business_description: string | null;
  // Ubicación jerárquica Perú (Fase 6, C4-G18) — agregada al final por
  // public_profiles_hierarchical_location.sql (0043), mismo motivo
  // posicional que PublicWorkerListing. Nullable: ver src/lib/location.ts.
  department: string | null;
  province: string | null;
  district: string | null;
}

/** Perfil de la contraparte en un chat — solo lo que PresenceBar/ChatWindow necesitan. */
export type ChatParticipant = Pick<Profile, "id" | "full_name" | "avatar_url" | "role">;

// Sistema multi-rol (ver docs/DISENO-MULTI-ROL.md)
// profiles.role = modo activo; user_roles = roles que el usuario posee.
export interface UserRoleRow {
  id: string;
  user_id: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  employer_id: string;
  title: string;
  description: string;
  category: string;
  city: string;
  // Ubicación jerárquica Perú (Fase 1, ver src/lib/ubigeo.ts) — nullable:
  // trabajos publicados antes de esta fase no la tienen.
  department: string | null;
  province: string | null;
  district: string | null;
  address: string | null;
  pay_amount: number | null;
  pay_type: PayType;
  status: JobStatus;
  positions_needed: number;
  assigned_worker_id: string | null;
  starts_at: string | null;
  hired_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  // Confirmación bilateral de trabajo terminado (Fase 8, C4-G21) — ambas
  // nullable, aditivas. `worker_reported_finished_at` lo fija el propio
  // trabajador asignado (reportJobFinished()); `employer_confirmed_at` lo
  // fija el empleador en el mismo UPDATE que `completed_at`/status. Ver
  // docs/FASE8-BILATERAL-COMPLETION.md.
  worker_reported_finished_at: string | null;
  employer_confirmed_at: string | null;
  // Horario confirmado del trabajo (Fase 3C/3E, calendario) — nullable:
  // se llenan recién cuando handle_application_accepted() (0055) copia una
  // propuesta completa y confirmada al aceptar la postulación, o quedan
  // NULL indefinidamente si la aceptación nunca tuvo una propuesta así.
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StateHistoryEntry {
  id: string;
  job_id: string;
  actor_id: string;
  prev_status: JobStatus | null;
  new_status: JobStatus;
  notes: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  job_id: string;
  employer_id: string;
  worker_id: string;
  created_at: string;
}

export type MessageType = "text" | "image" | "location" | "pdf" | "audio" | "video";

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  type: MessageType;
  attachment_url: string | null;
  metadata: Record<string, number | string | boolean | null> | null;
  read_at: string | null;
  created_at: string;
}

export interface ConversationReadCursor {
  conversation_id: string;
  profile_id: string;
  last_read_at: string;
}

export interface ConversationSettings {
  conversation_id: string;
  profile_id: string;
  is_muted: boolean;
  is_archived: boolean;
  is_blocked: boolean;
  muted_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationWithDetails extends Conversation {
  job: Pick<Job, "id" | "title" | "status"> | null;
  employer: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
  worker: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
  last_message: Message | null;
  unread_count: number;
  settings: ConversationSettings | null;
}

export interface JobApplication {
  id: string;
  job_id: string;
  worker_id: string;
  status: ApplicationStatus;
  message: string | null;
  // Doble consentimiento de horario (Fase 3D, 0054_job_application_schedule_consent.sql)
  // — protegidos por el trigger protect_application_schedule_consent()
  // (BEFORE UPDATE): el empleador nunca puede escribir
  // worker_schedule_confirmed_at, el worker nunca puede escribir
  // proposed_start_at/proposed_end_at. Cambiar la propuesta invalida
  // cualquier confirmación previa (worker_schedule_confirmed_at vuelve a NULL).
  proposed_start_at: string | null;
  proposed_end_at: string | null;
  worker_schedule_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Disponibilidad recurrente semanal de un perfil (worker o employer) —
 * profile_availability_slots (0051). `profile_id` referencia profiles(id):
 * la misma tabla sirve a ambos roles sin duplicar el modelo. Lectura
 * pública (RLS `using(true)`); escritura solo del dueño.
 */
export interface ProfileAvailabilitySlot {
  id: string;
  profile_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Excepción puntual de disponibilidad para una fecha concreta —
 * profile_availability_exceptions (0052). Único por (profile_id,
 * exception_date) — ver constraint `profile_availability_exceptions_unique_date`.
 * `start_time`/`end_time` solo pueden ser no nulos cuando `is_available=true`
 * (CHECK `profile_availability_exceptions_coherence_check`).
 */
export interface ProfileAvailabilityException {
  id: string;
  profile_id: string;
  exception_date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface Rating {
  id: string;
  job_id: string;
  rater_id: string;
  rated_id: string;
  score: number;
  comment: string | null;
  created_at: string;
}

export interface RatingSummary {
  profile_id: string;
  average_score: number;
  total_ratings: number;
}

// Notification types
export type NotificationType =
  | "new_application"
  | "application_accepted"
  | "application_rejected"
  | "new_message"
  | "job_started"
  | "job_completed"
  | "job_completion_requested"
  | "new_rating"
  | "reminder"
  | "system"
  | "admin_alert"
  | "report_status_update"
  | "moderation_action";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";
export type NotificationChannel = "in_app" | "push" | "email" | "whatsapp" | "sms";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, string | number | boolean | null>;
  is_read: boolean;
  read_at: string | null;
  priority: NotificationPriority;
  channel: NotificationChannel;
  sender_id: string | null;
  job_id: string | null;
  conversation_id: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  in_app: boolean;
  push: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  types_muted: NotificationType[];
  quiet_from: string | null;
  quiet_to: string | null;
  updated_at: string;
}

export interface BugReport {
  id: string;
  user_id: string | null;
  route: string;
  description: string;
  browser: string | null;
  os: string | null;
  resolution: string | null;
  version: string;
  created_at: string;
}

// Sistema de reportes de usuario / moderación (ver
// docs/user-reporting-moderation-design.md) — independiente de
// bug_reports/BugReport de arriba, que es solo para errores técnicos.
export type ReportTargetType = "user" | "job";

export type ReportReason =
  | "scam_fraud"
  | "inappropriate_behavior"
  | "non_compliance"
  | "harassment"
  | "suspicious_request"
  | "payment_issue"
  | "no_show"
  | "false_information"
  | "inappropriate_content"
  | "suspicious_terms"
  | "discrimination"
  | "spam"
  | "other";

export type ReportStatus = "pending" | "under_review" | "resolved" | "dismissed";

export type ModerationActionType =
  | "status_changed"
  | "note_added"
  | "warning_issued"
  | "temporary_suspension"
  | "permanent_block"
  | "account_deactivated"
  | "no_action";

export interface Report {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  reported_user_id: string | null;
  reported_job_id: string | null;
  related_job_id: string | null;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fila devuelta por la vista reporter_reports_view (0019) — el
 * subconjunto de columnas de `reports` que el propio denunciante puede
 * leer. No incluye admin_notes/reviewed_by/reviewed_at a propósito:
 * RLS no puede ocultar columnas dentro de una fila que el dueño ya
 * puede leer, así que la restricción vive en esta vista, no en una
 * policy. getMyReports() (src/lib/actions/reports.ts) siempre consulta
 * esta vista, nunca la tabla `reports` directamente.
 */
export interface ReporterReportView {
  id: string;
  target_type: ReportTargetType;
  reported_user_id: string | null;
  reported_job_id: string | null;
  related_job_id: string | null;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

export interface ReportEvidence {
  id: string;
  report_id: string;
  storage_path: string;
  file_name: string;
  content_type: string;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface ModerationAction {
  id: string;
  report_id: string | null;
  admin_id: string;
  target_user_id: string | null;
  action_type: ModerationActionType;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BetaStats {
  totalUsers: number;
  activeUsers: number;
  totalJobs: number;
  completedJobs: number;
  totalConversations: number;
  totalMessages: number;
  totalNotifications: number;
  bugReports: number;
  avgRating: number | null;
  avgHireMinutes: number | null;
}

// Tipos compuestos usados en la UI
export interface JobWithEmployer extends Job {
  employer: Pick<Profile, "id" | "full_name" | "avatar_url" | "city"> | null;
}

export interface ApplicationWithProfiles extends JobApplication {
  worker: PublicWorkerSummary | null;
  job: Job | null;
}

// Perfil profesional del trabajador (Fase 0)
export type DocumentType =
  | "dni"
  | "ruc"
  | "antecedentes_policiales"
  | "antecedentes_penales"
  | "certificado"
  | "licencia"
  | "carnet"
  | "otro";

export type DocumentStatus = "pending" | "verified" | "rejected";

export type DocumentRejectionReason =
  | "illegible"
  | "expired"
  | "data_mismatch"
  | "wrong_document"
  | "other";

export interface ProfilePhoto {
  id: string;
  profile_id: string;
  storage_path: string;
  public_url: string;
  is_primary: boolean;
  display_order: number;
  created_at: string;
}

export interface VerificationDocument {
  id: string;
  profile_id: string;
  document_type: DocumentType;
  storage_path: string;
  file_name: string;
  status: DocumentStatus;
  uploaded_at: string;
  verified_at: string | null;
  rejection_reason: DocumentRejectionReason | null;
  rejection_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface VerificationDocumentReview {
  id: string;
  document_id: string;
  reviewed_by: string;
  previous_status: DocumentStatus;
  new_status: DocumentStatus;
  rejection_reason: DocumentRejectionReason | null;
  rejection_note: string | null;
  created_at: string;
}

export interface ProfileStats {
  profile_id: string;
  completion_percentage: number;
  trust_score: number;
  badges: string[];
  updated_at: string;
}

// Información profesional ampliada (Fase 1)
export type AvailabilityStatus = "inmediata" | "una_semana" | "un_mes" | "no_disponible";

/** Todos los valores válidos del enum — única fuente para validar un valor
 * de origen externo (p.ej. searchParams del directorio de trabajadores)
 * antes de usarlo en una query. */
export const AVAILABILITY_VALUES: AvailabilityStatus[] = [
  "inmediata",
  "una_semana",
  "un_mes",
  "no_disponible",
];

/** Etiquetas legibles — única fuente para WorkerPublicProfileView (perfil)
 * y el directorio de trabajadores (filtro + tarjetas), para no mantener
 * el mismo Record duplicado en dos componentes. */
export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  inmediata: "Disponibilidad inmediata",
  una_semana: "Disponible en una semana",
  un_mes: "Disponible en un mes",
  no_disponible: "No disponible por ahora",
};

export interface WorkerProfileDetails {
  profile_id: string;
  professional_title: string | null;
  // Fase 1 (ubicación jerárquica): la ubicación estructurada del
  // trabajador vive en profiles.department/province/district (igual que
  // el empleador) — este district queda congelado en su valor histórico,
  // ver InfoTab.tsx.
  district: string | null;
  address: string | null;
  birth_date: string | null;
  whatsapp: string | null;
  availability: AvailabilityStatus;
  hourly_rate: number | null;
  daily_rate: number | null;
  years_experience: number | null;
  languages: string[];
  work_radius_km: number | null;
  created_at: string;
  updated_at: string;
}

// Experiencia laboral (Fase 2)
export interface WorkerExperience {
  id: string;
  profile_id: string;
  company: string;
  job_title: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Definición mínima de la base de datos para tipar el cliente de Supabase.
 * Cada tabla/vista incluye `Relationships: []` porque supabase-js exige esa
 * propiedad para reconocer el tipo como una tabla válida internamente; sin
 * ella, TypeScript no logra resolver el tipo y las mutaciones (.update(),
 * .insert()) colapsan silenciosamente a `never`.
 *
 * En producción se recomienda generar esto automáticamente con:
 * `supabase gen types typescript --project-id <id> > src/lib/database.types.ts`
 */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; full_name: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      jobs: {
        Row: Job;
        Insert: Partial<Job> & {
          employer_id: string;
          title: string;
          description: string;
          category: string;
          city: string;
        };
        Update: Partial<Job>;
        Relationships: [];
      };
      job_state_history: {
        Row: StateHistoryEntry;
        Insert: Partial<StateHistoryEntry> & {
          job_id: string;
          actor_id: string;
          new_status: JobStatus;
        };
        Update: Partial<StateHistoryEntry>;
        Relationships: [];
      };
      conversations: {
        Row: Conversation;
        Insert: Partial<Conversation> & {
          job_id: string;
          employer_id: string;
          worker_id: string;
        };
        Update: Partial<Conversation>;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: Partial<Message> & {
          conversation_id: string;
          sender_id: string;
          body: string;
        };
        Update: Partial<Message>;
        Relationships: [];
      };
      conversation_read_cursors: {
        Row: ConversationReadCursor;
        Insert: Partial<ConversationReadCursor> & {
          conversation_id: string;
          profile_id: string;
        };
        Update: Partial<ConversationReadCursor>;
        Relationships: [];
      };
      conversation_settings: {
        Row: ConversationSettings;
        Insert: Partial<ConversationSettings> & {
          conversation_id: string;
          profile_id: string;
        };
        Update: Partial<ConversationSettings>;
        Relationships: [];
      };
      job_applications: {
        Row: JobApplication;
        Insert: Partial<JobApplication> & { job_id: string; worker_id: string };
        Update: Partial<JobApplication>;
        Relationships: [];
      };
      ratings: {
        Row: Rating;
        Insert: Partial<Rating> & {
          job_id: string;
          rater_id: string;
          rated_id: string;
          score: number;
        };
        Update: Partial<Rating>;
        Relationships: [];
      };
      notifications: {
        Row: Notification;
        Insert: Partial<Notification> & {
          user_id: string;
          type: NotificationType;
          title: string;
          body: string;
        };
        Update: Partial<Notification>;
        Relationships: [];
      };
      notification_preferences: {
        Row: NotificationPreferences;
        Insert: Partial<NotificationPreferences> & { user_id: string };
        Update: Partial<NotificationPreferences>;
        Relationships: [];
      };
      bug_reports: {
        Row: BugReport;
        Insert: Partial<BugReport> & { route: string; description: string };
        Update: Partial<BugReport>;
        Relationships: [];
      };
      profile_photos: {
        Row: ProfilePhoto;
        Insert: Partial<ProfilePhoto> & {
          profile_id: string;
          storage_path: string;
          public_url: string;
        };
        Update: Partial<ProfilePhoto>;
        Relationships: [];
      };
      verification_documents: {
        Row: VerificationDocument;
        Insert: Partial<VerificationDocument> & {
          profile_id: string;
          document_type: DocumentType;
          storage_path: string;
          file_name: string;
        };
        Update: Partial<VerificationDocument>;
        Relationships: [];
      };
      verification_document_reviews: {
        Row: VerificationDocumentReview;
        Insert: Partial<VerificationDocumentReview> & {
          document_id: string;
          reviewed_by: string;
          previous_status: DocumentStatus;
          new_status: DocumentStatus;
        };
        Update: Partial<VerificationDocumentReview>;
        Relationships: [];
      };
      profile_stats: {
        Row: ProfileStats;
        Insert: Partial<ProfileStats> & { profile_id: string };
        Update: Partial<ProfileStats>;
        Relationships: [];
      };
      worker_profile_details: {
        Row: WorkerProfileDetails;
        Insert: Partial<WorkerProfileDetails> & { profile_id: string };
        Update: Partial<WorkerProfileDetails>;
        Relationships: [];
      };
      worker_experience: {
        Row: WorkerExperience;
        Insert: Partial<WorkerExperience> & {
          profile_id: string;
          company: string;
          job_title: string;
          start_date: string;
        };
        Update: Partial<WorkerExperience>;
        Relationships: [];
      };
      user_roles: {
        Row: UserRoleRow;
        Insert: Partial<UserRoleRow> & { user_id: string; role: UserRole };
        Update: Partial<UserRoleRow>;
        Relationships: [];
      };
      reports: {
        Row: Report;
        Insert: Partial<Report> & {
          reporter_id: string;
          target_type: ReportTargetType;
          reason: ReportReason;
          description: string;
        };
        Update: Partial<Report>;
        Relationships: [];
      };
      report_evidence: {
        Row: ReportEvidence;
        Insert: Partial<ReportEvidence> & {
          report_id: string;
          storage_path: string;
          file_name: string;
          content_type: string;
          uploaded_by: string;
        };
        Update: Partial<ReportEvidence>;
        Relationships: [];
      };
      moderation_actions: {
        Row: ModerationAction;
        Insert: Partial<ModerationAction> & {
          admin_id: string;
          action_type: ModerationActionType;
        };
        Update: Partial<ModerationAction>;
        Relationships: [];
      };
      profile_availability_slots: {
        Row: ProfileAvailabilitySlot;
        Insert: Partial<ProfileAvailabilitySlot> & {
          profile_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
        };
        Update: Partial<ProfileAvailabilitySlot>;
        Relationships: [];
      };
      profile_availability_exceptions: {
        Row: ProfileAvailabilityException;
        Insert: Partial<ProfileAvailabilityException> & {
          profile_id: string;
          exception_date: string;
          is_available: boolean;
        };
        Update: Partial<ProfileAvailabilityException>;
        Relationships: [];
      };
    };
    Views: {
      rating_summary: {
        Row: RatingSummary;
        Relationships: [];
      };
      reporter_reports_view: {
        Row: ReporterReportView;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
