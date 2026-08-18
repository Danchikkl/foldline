function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required public environment variable: ${name}`);
  }
  return value;
}

export const publicEnv = {
  appUrl: () =>
    required(process.env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL").replace(/\/$/, ""),

  supabaseUrl: () =>
    required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),

  supabasePublishableKey: () =>
    required(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ),
};