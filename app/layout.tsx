import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Analytics } from "@/components/analytics";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://foldline.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Foldline — catch duplicate and problem invoices before payment", template: "%s · Foldline" },
  description: "Invoice exception control for Accounts Payable. Foldline flags duplicate and near-duplicate supplier invoices, missing data and totals that don't add up, so AP reviews only what needs action.",
  applicationName: "Foldline",
  category: "business",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Foldline",
    title: "Foldline — catch the duplicate invoice your ERP lets through",
    description: "Duplicate, near-duplicate, incomplete and inconsistent supplier invoices — flagged before payment.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Foldline — catch the duplicate invoice your ERP lets through",
    description: "Duplicate, near-duplicate, incomplete and inconsistent supplier invoices — flagged before payment.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f4ee",
  colorScheme: "light",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") || undefined;
  return <html lang="en"><body>{children}<Analytics nonce={nonce}/></body></html>;
}
