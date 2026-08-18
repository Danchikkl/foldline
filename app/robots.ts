import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://foldline.app";
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/documents/", "/settings/", "/auth/"],
    }],
    sitemap: `${base.replace(/\/$/, "")}/sitemap.xml`,
  };
}
