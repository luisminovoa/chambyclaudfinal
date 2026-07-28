export const BETA_CONFIG = {
  version: "v0.6.0",
  stage: "Beta Privada",
  deployDate: process.env.NEXT_PUBLIC_DEPLOY_DATE ?? "2026-07-28",
  buildSha: process.env.NEXT_PUBLIC_BUILD_SHA ?? "local",
} as const;
