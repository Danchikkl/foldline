import { runInvoiceReliabilityFixtures } from "../lib/invoice-reliability-fixtures";

const results = runInvoiceReliabilityFixtures();
for (const result of results) {
  const mark = result.passed ? "PASS" : "FAIL";
  console.log(`${mark} ${result.name} — extraction=${result.extractionStatus}, risk=${result.riskLevel}`);
  if (!result.passed) console.error(`  ${result.details}`);
}

if (results.some((result) => !result.passed)) process.exit(1);
