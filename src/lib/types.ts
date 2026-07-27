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

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
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
