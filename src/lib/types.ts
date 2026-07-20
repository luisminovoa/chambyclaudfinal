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
  created_at: string;
  updated_at: string;
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
 * En producción se recomienda generar esto con:
 * `supabase gen types typescript --project-id <id> > src/lib/database.types.ts`
 */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; full_name: string };
        Update: Partial<Profile>;
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
      };
      job_applications: {
        Row: JobApplication;
        Insert: Partial<JobApplication> & { job_id: string; worker_id: string };
        Update: Partial<JobApplication>;
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
      };
    };
    Views: {
      rating_summary: {
        Row: RatingSummary;
      };
    };
  };
};
