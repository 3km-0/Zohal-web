import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

const SOURCE_URLS = {
  aqar: "https://sa.aqar.fm/login",
  bayut: "https://www.bayut.sa/",
};

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const inline = process.argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] || fallback;
  return fallback;
}

const source = arg("source", "aqar").toLowerCase();
const url = arg("url", SOURCE_URLS[source] || SOURCE_URLS.aqar);
const outputPath = arg("output", join("artifacts", "auth-state", `${source}.json`));

await mkdir(dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

const rl = createInterface({ input, output });
await rl.question([
  `Opened ${url}.`,
  "Sign in manually in the browser window.",
  `Press Enter here when ${source} is signed in and ready to save storage state.`,
  "",
].join("\n"));
rl.close();

await context.storageState({ path: outputPath });
await browser.close();

console.log(`Saved Playwright storage state for ${source} to ${outputPath}`);
console.log(`Set ${`ACQUISITION_BROWSER_AUTH_STATE_${source.toUpperCase()}`}=${outputPath} for authenticated worker runs.`);
