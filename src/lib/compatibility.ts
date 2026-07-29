import type { Profile, Job } from "@/lib/types";

/**
 * Scores how well a worker's profile matches a job posting (0–100).
 * Factors: category match (35), city match (25), verified profile (15),
 * profile completeness (15), accepted-jobs experience (10).
 */
export function computeCompatibility(
  profile: Profile,
  acceptedJobsCount: number,
  job: Job
): number {
  let score = 0;

  // Category match
  if (
    profile.category &&
    profile.category.toLowerCase() === job.category.toLowerCase()
  ) {
    score += 35;
  }

  // City match
  if (
    profile.city &&
    profile.city.toLowerCase() === job.city.toLowerCase()
  ) {
    score += 25;
  }

  // Verified (active profile)
  if (profile.is_active) score += 15;

  // Profile completeness (bio, phone, city, category + skills)
  const filledFields = [profile.bio, profile.phone, profile.city, profile.category].filter(Boolean).length;
  const skillsBonus = profile.skills?.length > 0 ? 5 : 0;
  score += Math.min(Math.floor((filledFields / 4) * 10) + skillsBonus, 15);

  // Experience from accepted jobs
  if (acceptedJobsCount >= 10) score += 10;
  else if (acceptedJobsCount >= 5) score += 7;
  else if (acceptedJobsCount >= 1) score += 4;

  return Math.min(score, 100);
}
