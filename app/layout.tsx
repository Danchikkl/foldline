import type { Metadata, Viewport } from "next";
import { Analytics } from "@/components/analytics";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://foldline.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Foldline — invoice exception control", template: "%s · Foldline" },
  description: "Catch duplicate, incomplete and inconsistent supplier invoices before they become AP rework or payment mistakes.",
  applicationName: "Foldline",
  category: "business",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Foldline",
    title: "Foldline — invoice exception control",
    description: "Catch invoice exceptions early: duplicates, incomplete core data and arithmetic mismatches.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Foldline — invoice exception control",
    description: "Catch invoice exceptions early: duplicates, incomplete core data and arithmetic mismatches.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f4ee",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Analytics /></body></html>;
}
