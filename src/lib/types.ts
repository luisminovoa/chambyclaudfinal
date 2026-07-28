export type UserRole = "worker" | "employer" | "admin";
export type JobStatus = "abierto" | "en_progreso" | "completado" | "cancelado";
export type ApplicationStatus = "pendiente" | "aceptado" | "rechazado" | "retirado";
export type PayType = "por_hora" | "por_dia" | "fijo";

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
}

export interface Job {
  id: string;
  employer_id: string;
  title: string;
  description: string;
  category: string;
  city: string;
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
  | "new_rating"
  | "reminder"
  | "system"
  | "admin_alert";

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
  worker: Profile | null;
  job: Job | null;
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
    };
    Views: {
      rating_summary: {
        Row: RatingSummary;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
