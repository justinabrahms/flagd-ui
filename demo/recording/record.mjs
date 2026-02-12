import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:9090";
const OUTPUT = process.env.OUTPUT || "demo/recording/flagd-ui-demo.webm";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: "demo/recording/raw", size: { width: 1280, height: 800 } },
  });

  const page = await context.newPage();

  // --- Flag list ---
  console.log("Opening flag list...");
  await page.goto(BASE);
  await page.waitForSelector(".flag-table");
  await sleep(2000);

  // --- Search ---
  console.log("Searching for 'pricing'...");
  await page.fill(".search-input", "");
  for (const ch of "pricing") {
    await page.type(".search-input", ch, { delay: 80 });
  }
  await sleep(1500);

  // Clear and search again
  console.log("Searching for 'checkout'...");
  await page.fill(".search-input", "");
  for (const ch of "checkout") {
    await page.type(".search-input", ch, { delay: 80 });
  }
  await sleep(1500);

  // --- Click into flag detail ---
  console.log("Opening flag detail...");
  await page.click('.flag-table a[href*="new-checkout-flow"]');
  await sleep(2500);

  // Scroll down to see targeting rules
  console.log("Scrolling to targeting rules...");
  await page.evaluate(() => window.scrollBy(0, 300));
  await sleep(2000);

  // --- Back to list ---
  console.log("Back to list...");
  await page.click(".flag-detail-back");
  await page.waitForSelector(".flag-table");
  await sleep(1000);

  // --- Clear search, show all ---
  console.log("Clearing search...");
  await page.fill(".search-input", "");
  await sleep(1500);

  // --- Filter by disabled ---
  console.log("Filtering disabled flags...");
  const filterBtns = await page.$$(".filter-btn");
  for (const btn of filterBtns) {
    const text = await btn.textContent();
    if (text.trim().toLowerCase() === "disabled") {
      await btn.click();
      break;
    }
  }
  await sleep(2000);

  // --- Back to all ---
  console.log("Showing all flags...");
  for (const btn of await page.$$(".filter-btn")) {
    const text = await btn.textContent();
    if (text.trim().toLowerCase() === "all") {
      await btn.click();
      break;
    }
  }
  await sleep(1500);

  // --- Click into a more complex flag ---
  console.log("Opening pricing-experiment detail...");
  await page.click('.flag-table a[href*="pricing-experiment"]');
  await sleep(2000);

  // Scroll through the detail
  await page.evaluate(() => window.scrollBy(0, 400));
  await sleep(2000);

  // --- Click into password-policy (object variants) ---
  console.log("Back to list, then password-policy...");
  await page.click(".flag-detail-back");
  await page.waitForSelector(".flag-table");
  await sleep(1000);

  await page.click('.flag-table a[href*="password-policy"]');
  await sleep(2000);
  await page.evaluate(() => window.scrollBy(0, 300));
  await sleep(2000);

  // --- Done ---
  console.log("Recording complete.");
  await page.close();
  await context.close();

  // Playwright saves video as .webm in the raw dir, move it
  const fs = await import("fs");
  const path = await import("path");
  const rawDir = "demo/recording/raw";
  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith(".webm"));
  if (files.length > 0) {
    const src = path.join(rawDir, files[files.length - 1]);
    fs.copyFileSync(src, OUTPUT);
    console.log(`Demo video saved to ${OUTPUT}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
