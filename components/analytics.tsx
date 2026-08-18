import Script from "next/script";

export function Analytics({ nonce }: { nonce?: string }) {
  const id = process.env.NEXT_PUBLIC_GA_ID;
  if (!id || !/^G-[A-Z0-9]+$/i.test(id)) return null;

  return <>
    <Script nonce={nonce} src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`} strategy="afterInteractive" />
    <Script nonce={nonce} id="google-analytics" strategy="afterInteractive">{`
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${id}', { anonymize_ip: true });
    `}</Script>
  </>;
}
