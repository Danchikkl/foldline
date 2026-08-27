import { assertSameOrigin } from "../lib/http";

type Case = {
  name: string;
  request: Request;
  shouldPass: boolean;
};

function request(url: string, headers: Record<string, string>) {
  return new Request(url, { method: "POST", headers });
}

const cases: Case[] = [
  {
    name: "same-origin POST with Origin",
    request: request("https://foldline.paperflow.workers.dev/auth/signout", {
      origin: "https://foldline.paperflow.workers.dev",
      host: "foldline.paperflow.workers.dev",
      "sec-fetch-site": "same-origin",
    }),
    shouldPass: true,
  },
  {
    name: "same-origin form POST with Referer fallback",
    request: request("https://foldline.paperflow.workers.dev/auth/signout", {
      referer: "https://foldline.paperflow.workers.dev/dashboard",
      host: "foldline.paperflow.workers.dev",
      "sec-fetch-site": "same-origin",
    }),
    shouldPass: true,
  },
  {
    name: "Cloudflare forwarded host with Referer fallback",
    request: request("https://internal.invalid/auth/signout", {
      referer: "https://foldline.paperflow.workers.dev/dashboard",
      host: "internal.invalid",
      "x-forwarded-host": "foldline.paperflow.workers.dev",
      "sec-fetch-site": "same-origin",
    }),
    shouldPass: true,
  },
  {
    name: "cross-site POST is forbidden",
    request: request("https://foldline.paperflow.workers.dev/auth/signout", {
      origin: "https://evil.example",
      host: "foldline.paperflow.workers.dev",
      "sec-fetch-site": "cross-site",
    }),
    shouldPass: false,
  },
  {
    name: "mismatched Referer host is forbidden",
    request: request("https://foldline.paperflow.workers.dev/auth/signout", {
      referer: "https://evil.example/page",
      host: "foldline.paperflow.workers.dev",
      "sec-fetch-site": "same-origin",
    }),
    shouldPass: false,
  },
  {
    name: "missing Origin and Referer remains forbidden",
    request: request("https://foldline.paperflow.workers.dev/auth/signout", {
      host: "foldline.paperflow.workers.dev",
      "sec-fetch-site": "same-origin",
    }),
    shouldPass: false,
  },
];

let failed = false;
for (const testCase of cases) {
  let passed = true;
  try {
    assertSameOrigin(testCase.request);
  } catch {
    passed = false;
  }

  const ok = passed === testCase.shouldPass;
  console.log(`${ok ? "PASS" : "FAIL"} ${testCase.name}`);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
