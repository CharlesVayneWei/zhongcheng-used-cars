export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export function hasDatabaseConfig() {
  return Boolean(process.env.DATABASE_URL);
}
