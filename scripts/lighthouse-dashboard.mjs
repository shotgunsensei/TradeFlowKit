import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import CDP from "chrome-remote-interface";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:5000";

async function loginCookie() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "demo", password: "demo123" }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("no set-cookie header");
  const m = /([^=]+)=([^;]+)/.exec(setCookie);
  return { name: m[1], value: m[2] };
}

function scrubLhrSecrets(lhr) {
  if (lhr?.configSettings?.extraHeaders) lhr.configSettings.extraHeaders = null;
  return lhr;
}

const cookie = await loginCookie();

const chrome = await chromeLauncher.launch({
  chromePath: ".cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  chromeFlags: [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ],
});

try {
  const url = new URL(BASE);
  // Inject the auth cookie into the browser via CDP so it never appears in
  // Lighthouse's configSettings (which would otherwise be persisted to the
  // committed report artifacts).
  const cdp = await CDP({ port: chrome.port });
  try {
    await cdp.Network.enable();
    await cdp.Network.setCookie({
      name: cookie.name,
      value: cookie.value,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: false,
    });
  } finally {
    await cdp.close();
  }

  const result = await lighthouse(
    `${BASE}/dashboard`,
    {
      port: chrome.port,
      output: ["json", "html"],
      logLevel: "error",
      onlyCategories: ["accessibility"],
    },
    {
      extends: "lighthouse:default",
      settings: {
        formFactor: "desktop",
        screenEmulation: { mobile: false, disabled: true },
        throttlingMethod: "provided",
      },
    },
  );

  const lhr = scrubLhrSecrets(result.lhr);
  const score = Math.round((lhr.categories.accessibility.score || 0) * 100);
  const audits = lhr.categories.accessibility.auditRefs
    .map((ref) => ({ ref, audit: lhr.audits[ref.id] }))
    .filter(({ audit }) => audit.score !== null && audit.score < 1)
    .map(({ ref, audit }) => ({
      id: audit.id,
      title: audit.title,
      score: audit.score,
      weight: ref.weight,
      displayValue: audit.displayValue,
      items:
        (audit.details && audit.details.items
          ? audit.details.items.slice(0, 5).map((i) => ({
              snippet: i.node?.snippet,
              selector: i.node?.selector,
              explanation: i.node?.explanation,
            }))
          : []),
    }));

  fs.mkdirSync("docs/a11y", { recursive: true });
  // Re-serialize the scrubbed LHR rather than using the lighthouse-generated
  // report buffer, so any auth headers are guaranteed to be absent.
  fs.writeFileSync(
    "docs/a11y/dashboard-lighthouse.report.json",
    JSON.stringify(lhr, null, 2),
  );
  if (Array.isArray(result.report) && result.report[1]) {
    fs.writeFileSync("docs/a11y/dashboard-lighthouse.report.html", result.report[1]);
  }

  const summary = {
    url: `${BASE}/dashboard`,
    runAt: new Date().toISOString(),
    lighthouseVersion: lhr.lighthouseVersion,
    formFactor: lhr.configSettings.formFactor,
    accessibilityScore: score,
    failingAudits: audits,
  };
  fs.writeFileSync(
    "docs/a11y/dashboard-lighthouse.summary.json",
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  process.exit(score >= 95 ? 0 : 1);
} finally {
  await chrome.kill();
}
