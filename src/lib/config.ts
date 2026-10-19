// Public connection details for the Hour Keeper Supabase project.
// The publishable key is designed to ship inside the app; access is enforced
// by the database's Row Level Security rules, not by keeping this secret.
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://ryjgswoddtccleabvmjh.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_cRILPI_SW5tJNBmje2Bzow_dZw28D1Q';

// Where people open the app (shared in invites).
export const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? 'https://hourkeeper.vercel.app';
