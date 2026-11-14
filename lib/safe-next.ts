// Only same-site paths are allowed as post-login destinations (no open redirects).
const ALLOWED = ["/vault", "/dashboard"];

export function safeNext(value: string | null | undefined): string {
  if (!value) return "/dashboard";
  return ALLOWED.find((p) => value === p || value.startsWith(p + "/")) && !value.includes("//") ? value : "/dashboard";
}
