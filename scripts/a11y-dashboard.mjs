import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:5000";

async function login(context) {
  const r = await context.request.post(`${BASE}/api/auth/login`, {
    data: { username: "demo", password: "demo123" },
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`login failed: ${r.status()}`);
}

const axeSrc = fs.readFileSync("/tmp/axe.min.js", "utf8");

const LH_A11Y_RULES = new Set([
  "accesskeys","aria-allowed-attr","aria-command-name","aria-hidden-body",
  "aria-hidden-focus","aria-input-field-name","aria-meter-name",
  "aria-progressbar-name","aria-required-attr","aria-required-children",
  "aria-required-parent","aria-roles","aria-toggle-field-name",
  "aria-tooltip-name","aria-treeitem-name","aria-valid-attr-value",
  "aria-valid-attr","button-name","bypass","color-contrast",
  "definition-list","dlitem","document-title","duplicate-id-active",
  "duplicate-id-aria","form-field-multiple-labels","frame-title",
  "heading-order","html-has-lang","html-lang-valid","html-xml-lang-mismatch",
  "image-alt","input-button-name","input-image-alt","label","link-name",
  "list","listitem","meta-refresh","meta-viewport","object-alt",
  "select-name","skip-link","tabindex","table-duplicate-name",
  "table-fake-caption","td-has-header","td-headers-attr","th-has-data-cells",
  "valid-lang","video-caption",
]);

const browser = await chromium.launch({
  executablePath: ".cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext();
await login(ctx);
const page = await ctx.newPage();
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.addScriptTag({ content: axeSrc });
const results = await page.evaluate(async () => {
  // run axe with the same ruleset Lighthouse uses (best-practice, wcag2a, wcag2aa)
  // eslint-disable-next-line no-undef
  return await axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
  });
});
await browser.close();

const lhViolations = results.violations.filter((v) => LH_A11Y_RULES.has(v.id));
const totalNodes = lhViolations.reduce((s, v) => s + v.nodes.length, 0);

const summary = {
  url: `${BASE}/dashboard`,
  scannedAt: new Date().toISOString(),
  axeVersion: results.testEngine?.version,
  lighthouseRulesChecked: LH_A11Y_RULES.size,
  totalAxeViolations: results.violations.length,
  lighthouseRuleViolations: lhViolations.length,
  affectedNodes: totalNodes,
  passes: results.passes.length,
  // Lighthouse a11y score is binary-weighted: any failing weighted rule
  // drops the score. With 0 lighthouse-rule violations, score == 100.
  estimatedLighthouseAccessibilityScore: lhViolations.length === 0 ? 100 : null,
  violations: lhViolations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    sampleTargets: v.nodes.slice(0, 3).map((n) => n.target),
  })),
};

fs.mkdirSync("docs/a11y", { recursive: true });
fs.writeFileSync(
  "docs/a11y/dashboard-axe-report.json",
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
process.exit(lhViolations.length === 0 ? 0 : 1);
