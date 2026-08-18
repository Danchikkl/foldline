import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://foldline.app").replace(/\/$/, "");
  const paths = ["", "/pricing", "/security", "/use-cases", "/case-studies", "/legal/privacy", "/legal/terms"];
  return paths.map((path, i) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: i === 0 ? "weekly" : "monthly",
    priority: i === 0 ? 1 : path === "/pricing" ? 0.8 : 0.6,
  }));
}
