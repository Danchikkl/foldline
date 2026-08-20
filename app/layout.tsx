import type { Metadata, Viewport } from "next";
import { Analytics } from "@/components/analytics";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://foldline.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Foldline — trusted document data", template: "%s · Foldline" },
  description: "Turn invoices and messy business documents into reviewed, traceable data with evidence-linked extraction and review by exception.",
  applicationName: "Foldline",
  category: "business",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Foldline",
    title: "Foldline — trusted document data",
    description: "Messy documents in. Trusted data out. Review exceptions, not every field.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Foldline — trusted document data",
    description: "Messy documents in. Trusted data out. Review exceptions, not every field.",
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
