#!/usr/bin/env node
// Deterministic fixture repo ("shopkit") built to give every lean feature something to bite on:
//   src/engine.js       2,000+ lines        -> bigread / readsymbol
//   data/orders.json    ~1.5 MB             -> datapeek
//   data/server.log     30k lines           -> datapeek
//   dist/shopkit.min.js committed bundle    -> junkfilter (pollutes grep results)
//   test/               90+ noisy tests, 1 real bug in src/money.js -> bashcompact
//   multi-step task     edit + test loops   -> readcache, batchedit
//
//   node bench/fixture.mjs <dir>     writes the repo, commits it, prints the facts tasks check
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pad = (n, w = 3) => String(n).padStart(w, "0");

const MONEY = `// Money helpers used across the shop.
export function roundCents(n) {
  return Math.round(n * 100) / 100;
}

export function formatCurrency(amount) {
  const sign = amount < 0 ? "-" : "";
  const [whole, cents] = Math.abs(roundCents(amount)).toFixed(2).split(".");
  return \`\${sign}$\${whole.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",")}.\${cents}\`;
}

export function parsePrice(text) {
  return Number(String(text).replace(/[^0-9.-]/g, ""));
}

// percent may be a fraction (0.25) or a whole number (25).
export function applyDiscount(price, percent) {
  const rate = percent > 1 ? percent / 100 : percent;
  const loyalty = rate >= 0.5 ? 0.9 : 1;
  return roundCents(price * (1 - rate) * loyalty);
}
`;

const TAGS = ["sale", "bulk", "fragile", "gift", "clearance", "new", "import", "local"];
const DESCS = ["bulk savings", "gift bundle", "clearance bonus", "local pickup credit", "import surcharge offset", "new arrival promo", "fragile handling credit", "seasonal sale"];

function engine(r) {
  const out = [
    "// Pricing engine: per-item rules, shipping, tax and order totals.",
    'import { applyDiscount, formatCurrency, roundCents } from "./money.js";',
    "",
  ];
  const names = [];
  const rule = (i) => {
    const n = `rule${pad(i)}`;
    names.push(n);
    const tag = TAGS[i % TAGS.length];
    out.push(
      "/**",
      ` * Rule ${pad(i)}: ${DESCS[i % DESCS.length]}.`,
      ` * Applies to orders with at least ${1 + (i % 4)} items and a subtotal over $${20 + (i % 9) * 15}.`,
      " */",
      `export function ${n}(order) {`,
      `  if (!order.items || order.items.length < ${1 + (i % 4)}) return 0;`,
      "  const subtotal = order.items.reduce((s, it) => s + it.price * it.qty, 0);",
      `  if (subtotal < ${20 + (i % 9) * 15}) return 0;`,
      `  const tagged = order.items.filter((it) => it.tags?.includes("${tag}"));`,
      `  return roundCents(tagged.length * ${(0.05 + r() * 0.4).toFixed(2)});`,
      "}",
      ""
    );
  };
  for (let i = 1; i <= 50; i++) rule(i);
  out.push(
    "// Shipping: free over $75, flat rate per region otherwise.",
    "function shippingFor(order, amount) {",
    "  if (amount >= 75) return 0;",
    '  const flat = { us: 6.5, eu: 9, uk: 8, other: 14 }[order.region] ?? 14;',
    "  const heavy = order.items.some((it) => it.tags?.includes(\"bulk\")) ? 4 : 0;",
    "  return roundCents(flat + heavy);",
    "}",
    ""
  );
  for (let i = 51; i <= 110; i++) rule(i);
  out.push(
    "// Tax: VAT for EU/UK, sales tax for US, none elsewhere.",
    "function taxFor(region, amount) {",
    '  const rate = { us: 0.0725, eu: 0.2, uk: 0.2 }[region] ?? 0;',
    "  return roundCents(amount * rate);",
    "}",
    ""
  );
  for (let i = 111; i <= 160; i++) rule(i);
  out.push("export const RULES = [");
  for (let i = 0; i < names.length; i += 10) out.push(`  ${names.slice(i, i + 10).join(", ")},`);
  out.push(
    "];",
    "",
    "/** Full price breakdown for one order. */",
    "export function computeTotals(order) {",
    "  const subtotal = roundCents(order.items.reduce((s, it) => s + it.price * it.qty, 0));",
    "  const ruleSavings = roundCents(RULES.reduce((s, rule) => s + rule(order), 0));",
    "  const discounted = applyDiscount(Math.max(0, subtotal - ruleSavings), order.couponPercent ?? 0);",
    "  const shipping = shippingFor(order, discounted);",
    "  const tax = taxFor(order.region, discounted);",
    "  const total = roundCents(discounted + shipping + tax);",
    "  return { subtotal, ruleSavings, discounted, shipping, tax, total, display: formatCurrency(total) };",
    "}",
    ""
  );
  return { src: out.join("\n"), names };
}

const ORDERS = `import { computeTotals } from "./engine.js";
import { formatCurrency } from "./money.js";

export function summarizeOrder(order) {
  const t = computeTotals(order);
  return \`\${order.id}: \${order.items.length} items, total \${formatCurrency(t.total)}\`;
}

export function refundAmount(order) {
  return formatCurrency(computeTotals(order).total);
}
`;

const REPORT = `import { formatCurrency } from "./money.js";

// One line per order, then a grand total.
export function buildReport(orders) {
  const lines = orders.map((o) => \`\${o.id.padEnd(12)} \${o.status.padEnd(9)} \${formatCurrency(o.total)}\`);
  const grand = orders.reduce((s, o) => s + o.total, 0);
  lines.push(\`TOTAL \${formatCurrency(grand)}\`);
  return lines.join("\\n");
}
`;

const MONEY_TEST = `import { test } from "node:test";
import assert from "node:assert/strict";
import { roundCents, formatCurrency, parsePrice, applyDiscount } from "../src/money.js";

test("roundCents rounds to two places", () => assert.equal(roundCents(1.005 * 100 / 100), 1));
test("formatCurrency adds thousands separators", () => assert.equal(formatCurrency(1234.5), "$1,234.50"));
test("formatCurrency handles negatives", () => assert.equal(formatCurrency(-3), "-$3.00"));
test("formatCurrency handles zero", () => assert.equal(formatCurrency(0), "$0.00"));
test("parsePrice strips symbols", () => assert.equal(parsePrice("$1,299.99"), 1299.99));
test("applyDiscount takes whole-number percents", () => assert.equal(applyDiscount(100, 10), 90));
test("applyDiscount takes fractions", () => assert.equal(applyDiscount(80, 0.25), 60));
// Discounts are exactly what the customer was promised: never stacked with anything else.
test("applyDiscount applies deep discounts exactly", () => assert.equal(applyDiscount(100, 60), 40));
`;

function engineTest(names) {
  const out = [
    'import { test } from "node:test";',
    'import assert from "node:assert/strict";',
    `import { ${names.join(", ")}, computeTotals } from "../src/engine.js";`,
    "",
    'const sample = { region: "eu", items: [{ price: 40, qty: 2, tags: ["sale", "gift"] }, { price: 25, qty: 1, tags: ["bulk"] }] };',
    "",
  ];
  for (const n of names) {
    out.push(`test("${n} ignores empty orders", () => assert.equal(${n}({ items: [] }), 0));`);
    out.push(`test("${n} never returns a negative saving", () => assert.ok(${n}(sample) >= 0));`);
  }
  out.push(
    'test("computeTotals adds shipping under $75", () => {',
    '  const t = computeTotals({ region: "us", items: [{ price: 10, qty: 1, tags: [] }] });',
    "  assert.equal(t.shipping, 6.5);",
    "});",
    ""
  );
  return out.join("\n");
}

const REPORT_TEST = `import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "../src/report.js";

test("buildReport lists orders and a total", () => {
  const r = buildReport([{ id: "ord_1", status: "paid", total: 12 }, { id: "ord_2", status: "paid", total: 3.5 }]);
  assert.match(r, /ord_1 .* \\$12\\.00/);
  assert.match(r, /TOTAL \\$15\\.50/);
});
`;

function orders(r) {
  const statuses = ["paid", "paid", "paid", "paid", "paid", "shipped", "shipped", "shipped", "pending", "pending", "refunded"];
  const regions = ["us", "us", "eu", "uk", "other"];
  const list = [];
  for (let i = 1; i <= 4000; i++) {
    const items = [];
    for (let k = 0, n = 1 + Math.floor(r() * 5); k < n; k++)
      items.push({
        sku: `SKU-${pad(Math.floor(r() * 900) + 100)}`,
        price: Math.round(r() * 12000) / 100,
        qty: 1 + Math.floor(r() * 3),
        tags: TAGS.filter(() => r() < 0.2),
      });
    list.push({
      id: `ord_${pad(i, 5)}`,
      customer: `cust_${pad(Math.floor(r() * 1500), 4)}`,
      status: statuses[Math.floor(r() * statuses.length)],
      region: regions[Math.floor(r() * regions.length)],
      currency: r() < 0.12 ? "EUR" : "USD",
      couponPercent: r() < 0.2 ? [5, 10, 15, 25][Math.floor(r() * 4)] : 0,
      createdAt: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString(),
      items,
    });
  }
  return list;
}

function serverLog(r) {
  const errors = [
    ["E2001", "payment gateway timeout"],
    ["E1042", "inventory lock contention"],
    ["E3307", "tax service returned 503"],
    ["E4100", "webhook signature mismatch"],
  ];
  const weights = [0.42, 0.33, 0.17, 0.08];
  const lines = [];
  let t = Date.UTC(2026, 9, 1);
  for (let i = 0; i < 30000; i++) {
    t += Math.floor(r() * 4000);
    const ts = new Date(t).toISOString();
    const x = r();
    if (x < 0.017) {
      let y = r();
      let k = 0;
      while (y > weights[k]) y -= weights[k++];
      const [code, msg] = errors[k];
      lines.push(`${ts} ERROR [${code}] ${msg} order=ord_${pad(Math.floor(r() * 4000) + 1, 5)} attempt=${1 + Math.floor(r() * 3)}`);
    } else if (x < 0.06) lines.push(`${ts} WARN slow query table=orders took=${200 + Math.floor(r() * 900)}ms`);
    else if (x < 0.5) lines.push(`${ts} INFO GET /api/orders/ord_${pad(Math.floor(r() * 4000) + 1, 5)} 200 ${5 + Math.floor(r() * 80)}ms`);
    else if (x < 0.8) lines.push(`${ts} INFO POST /api/cart 201 ${10 + Math.floor(r() * 120)}ms`);
    else lines.push(`${ts} INFO healthcheck ok uptime=${Math.floor(t / 1000)}`);
  }
  return lines;
}

export function generate(dir) {
  const r = rng(424242);
  const files = {};
  const eng = engine(r);
  files["package.json"] = JSON.stringify({ name: "shopkit", version: "1.4.0", type: "module", scripts: { test: "node --test" } }, null, 2) + "\n";
  files[".gitignore"] = "node_modules/\n";
  files["README.md"] = "# shopkit\n\nPricing, orders and reporting for the shop. `npm test` runs the suite. `dist/` holds the published bundle.\n";
  files["src/money.js"] = MONEY;
  files["src/engine.js"] = eng.src;
  files["src/orders.js"] = ORDERS;
  files["src/report.js"] = REPORT;
  files["test/money.test.js"] = MONEY_TEST;
  files["test/engine.test.js"] = engineTest(eng.names);
  files["test/report.test.js"] = REPORT_TEST;
  const ord = orders(r);
  files["data/orders.json"] = JSON.stringify(ord, null, 1) + "\n";
  const log = serverLog(r);
  files["data/server.log"] = log.join("\n") + "\n";
  // Committed bundle: the sources squashed onto a few very long lines.
  const bundle = [MONEY, eng.src, ORDERS, REPORT].join(";").replace(/\/\/[^\n]*|\/\*\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
  files["dist/shopkit.min.js"] = bundle.match(/.{1,6000}/g).join("\n") + "\n";
  files["package-lock.json"] =
    JSON.stringify({ name: "shopkit", lockfileVersion: 3, packages: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`node_modules/pkg-${i}`, { version: `1.${i % 20}.${i % 7}`, resolved: `https://registry.npmjs.org/pkg-${i}/-/pkg-${i}-1.0.0.tgz`, integrity: `sha512-${"x".repeat(64)}` }])) }, null, 2) + "\n";

  for (const [f, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), body);
  }
  const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.name=bench", "-c", "user.email=bench@example.com", "commit", "-q", "-m", "shopkit fixture");

  const codes = new Map();
  for (const l of log) {
    const m = l.match(/ERROR \[(E\d+)\]/);
    if (m) codes.set(m[1], (codes.get(m[1]) ?? 0) + 1);
  }
  const [topCode, topCount] = [...codes].sort((a, b) => b[1] - a[1])[0];
  return {
    refunded: ord.filter((o) => o.status === "refunded").length,
    topCode,
    topCount,
    engineLines: eng.src.split("\n").length,
    computeTotalsLine: eng.src.split("\n").findIndex((l) => l.startsWith("export function computeTotals")) + 1,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(generate(process.argv[2])));
}
