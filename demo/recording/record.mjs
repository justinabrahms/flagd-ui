import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:9090";
const OUTPUT = process.env.OUTPUT || "demo/recording/flagd-ui-demo.gif";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Theme tokens (match frontend/src/index.css)
// ---------------------------------------------------------------------------
const THEME = {
  bg: "#0f1117",
  bgSurface: "#1a1d27",
  border: "#2e3347",
  text: "#e1e4ed",
  textMuted: "#8b8fa7",
  accent: "#6e7bf2",
  accentHover: "#8490ff",
  green: "#34d399",
  fontStack: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
  monoStack: `"JetBrains Mono", "Fira Code", "Cascadia Code", monospace`,
};

// ---------------------------------------------------------------------------
// Title card HTML generator
// ---------------------------------------------------------------------------
function titleCardHTML({ lines, subtitle, small }) {
  // lines: array of {text, size?, mono?, color?, bold?, spacing?}
  const lineEls = lines
    .map((l) => {
      const size = l.size || "2.8rem";
      const color = l.color || THEME.text;
      const font = l.mono ? THEME.monoStack : THEME.fontStack;
      const weight = l.bold !== false ? "700" : "400";
      const spacing = l.spacing || (l.size && parseFloat(l.size) < 2 ? "0.01em" : "-0.02em");
      return `<div style="font-size:${size};color:${color};font-family:${font};font-weight:${weight};line-height:1.2;letter-spacing:${spacing};margin:0;">${l.text}</div>`;
    })
    .join("\n");

  const subtitleEl = subtitle
    ? `<div style="font-size:1.15rem;color:${THEME.textMuted};font-family:${THEME.fontStack};font-weight:400;margin-top:2rem;max-width:580px;line-height:1.7;letter-spacing:0.01em;">${subtitle}</div>`
    : "";

  const smallEl = small
    ? `<div style="font-size:0.9rem;color:${THEME.textMuted};font-family:${THEME.monoStack};font-weight:400;margin-top:2.5rem;opacity:0.5;letter-spacing:0.03em;">${small}</div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;display:flex;align-items:center;justify-content:center;flex-direction:column;height:100vh;background:${THEME.bg};text-align:center;padding:3rem;gap:0.3rem;">
${lineEls}
${subtitleEl}
${smallEl}
</body></html>`;
}

// Show a title card via setContent (works reliably in headless, no navigation)
async function showTitleCard(page, opts) {
  await page.setContent(titleCardHTML(opts), { waitUntil: "load" });
}

// ---------------------------------------------------------------------------
// Fake cursor helpers
// ---------------------------------------------------------------------------
async function injectCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById("__fake_cursor")) return;
    const el = document.createElement("div");
    el.id = "__fake_cursor";
    Object.assign(el.style, {
      position: "fixed",
      top: "0px",
      left: "0px",
      width: "20px",
      height: "20px",
      borderRadius: "50%",
      background: "rgba(110, 123, 242, 0.55)",
      border: "2px solid rgba(110, 123, 242, 0.9)",
      pointerEvents: "none",
      zIndex: "999999",
      transform: "translate(-50%, -50%)",
      transition: "opacity 0.2s",
      opacity: "0",
    });
    document.body.appendChild(el);
  });
}

async function showCursor(page) {
  await page.evaluate(() => {
    const el = document.getElementById("__fake_cursor");
    if (el) el.style.opacity = "1";
  });
}

async function hideCursor(page) {
  await page.evaluate(() => {
    const el = document.getElementById("__fake_cursor");
    if (el) el.style.opacity = "0";
  });
}

async function moveCursor(page, x, y) {
  await page.evaluate(
    ([cx, cy]) => {
      const el = document.getElementById("__fake_cursor");
      if (el) {
        el.style.left = cx + "px";
        el.style.top = cy + "px";
      }
    },
    [x, y]
  );
  await page.mouse.move(x, y);
}

// Smooth glide from current position to target, with real mouse events.
// Uses ease-in-out so the cursor accelerates then decelerates like a real hand.
// Step count is high enough that individual jumps aren't visible at 25fps.
async function glideTo(page, x, y, { steps = 40, duration = 500 } = {}) {
  const start = await page.evaluate(() => {
    const el = document.getElementById("__fake_cursor");
    if (!el) return { x: 0, y: 0 };
    return {
      x: parseFloat(el.style.left) || 0,
      y: parseFloat(el.style.top) || 0,
    };
  });

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // ease-in-out: smooth acceleration then deceleration
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const cx = start.x + (x - start.x) * ease;
    const cy = start.y + (y - start.y) * ease;
    await moveCursor(page, cx, cy);
    await sleep(duration / steps);
  }
}

// Get center of an element by selector
async function centerOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`Element not found: ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Glide to element and click
async function glideAndClick(page, selector, opts = {}) {
  const { x, y } = await centerOf(page, selector);
  await glideTo(page, x, y, opts);
  await sleep(150);
  await page.click(selector);
}

// Glide to element, click, and type character by character
async function glideAndType(page, selector, text, { charDelay = 70 } = {}) {
  const { x, y } = await centerOf(page, selector);
  await glideTo(page, x, y);
  await sleep(150);
  await page.click(selector);
  for (const ch of text) {
    await page.type(selector, ch, { delay: charDelay });
  }
}

// ---------------------------------------------------------------------------
// Annotation overlay helpers
// ---------------------------------------------------------------------------
async function showAnnotation(page, { text, near, position = "below", duration = 2500 }) {
  await page.evaluate(
    ([txt, sel, pos]) => {
      const target = document.querySelector(sel);
      if (!target) return;
      const rect = target.getBoundingClientRect();

      const pill = document.createElement("div");
      pill.className = "__annotation";
      pill.textContent = txt;
      Object.assign(pill.style, {
        position: "fixed",
        zIndex: "999998",
        background: "rgba(110, 123, 242, 0.18)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(110, 123, 242, 0.5)",
        color: "#e1e4ed",
        fontFamily: `"Inter", -apple-system, sans-serif`,
        fontSize: "0.85rem",
        fontWeight: "600",
        padding: "0.45em 1em",
        borderRadius: "6px",
        whiteSpace: "nowrap",
        opacity: "0",
        transition: "opacity 0.4s ease-in-out",
        pointerEvents: "none",
      });

      // Position relative to the target element
      if (pos === "above") {
        pill.style.left = rect.left + "px";
        pill.style.top = rect.top - 40 + "px";
      } else if (pos === "below") {
        pill.style.left = rect.left + "px";
        pill.style.top = rect.bottom + 10 + "px";
      } else if (pos === "right") {
        pill.style.left = rect.right + 16 + "px";
        pill.style.top = rect.top + "px";
      }

      document.body.appendChild(pill);
      requestAnimationFrame(() => (pill.style.opacity = "1"));
    },
    [text, near, position]
  );

  await sleep(duration);

  // Fade out and remove
  await page.evaluate(() => {
    document.querySelectorAll(".__annotation").forEach((el) => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 400);
    });
  });
  await sleep(450);
}

// ---------------------------------------------------------------------------
// Main recording script
// ---------------------------------------------------------------------------
async function main() {
  // Clean raw directory so we only have one .webm to pick from
  const fs = await import("fs");
  const path = await import("path");
  const rawDir = "demo/recording/raw";
  if (fs.existsSync(rawDir)) {
    for (const f of fs.readdirSync(rawDir)) {
      fs.unlinkSync(path.join(rawDir, f));
    }
  }
  fs.mkdirSync(rawDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: rawDir, size: { width: 1280, height: 800 } },
  });

  const page = await context.newPage();

  // =========================================================================
  // TITLE CARD: Intro
  // =========================================================================
  console.log("Title card: Intro");
  await showTitleCard(page, {
    lines: [
      { text: "flagd-ui", size: "3.5rem", mono: true, color: THEME.accent },
      { text: "A management UI for flagd", size: "1.4rem", color: THEME.textMuted, bold: false },
    ],
  });
  await sleep(3000);

  // =========================================================================
  // LIVE DEMO
  // =========================================================================

  // --- Flag list loads ---
  console.log("Opening flag list...");
  await page.goto(BASE);
  await page.waitForSelector(".flag-table");
  await injectCursor(page);
  await sleep(1500);

  // Annotation: flag count
  await showAnnotation(page, {
    text: "16 flags loaded from a local git checkout",
    near: ".flag-count",
    position: "right",
    duration: 2500,
  });
  await sleep(500);

  // --- Search for "checkout" ---
  console.log("Searching for 'checkout'...");
  await showCursor(page);
  await glideAndType(page, ".search-input", "checkout");
  await sleep(1500);

  // --- Click into new-checkout-flow ---
  console.log("Opening new-checkout-flow detail...");
  await glideAndClick(page, '.flag-table a[href*="new-checkout-flow"]');
  await sleep(1500);

  // Scroll to targeting rules
  const targetingH2 = page.locator("h2", { hasText: "Targeting Rules" });
  if ((await targetingH2.count()) > 0) {
    const box = await targetingH2.boundingBox();
    if (box) {
      await glideTo(page, 640, box.y);
      await page.evaluate((y) => window.scrollTo({ top: y - 100, behavior: "smooth" }), box.y);
      await sleep(800);
    }
  }

  // Annotation: targeting rules (target the Targeting Rules heading specifically)
  await showAnnotation(page, {
    text: "Targeting rules \u2014 who sees what",
    near: ".detail-section:last-of-type .detail-card",
    position: "above",
    duration: 2500,
  });

  // --- Back to list ---
  console.log("Back to list...");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(400);
  await glideAndClick(page, ".flag-detail-back");
  await page.waitForSelector(".flag-table");
  await injectCursor(page);
  await sleep(800);

  // Clear search
  console.log("Clearing search...");
  await glideAndClick(page, ".search-input");
  await page.fill(".search-input", "");
  await sleep(800);

  // --- Click into pricing-experiment ---
  console.log("Opening pricing-experiment detail...");
  await glideAndClick(page, '.flag-table a[href*="pricing-experiment"]');
  await sleep(1500);

  // Scroll to targeting/fractional
  const targetingH2b = page.locator("h2", { hasText: "Targeting Rules" });
  if ((await targetingH2b.count()) > 0) {
    const box = await targetingH2b.boundingBox();
    if (box) {
      await glideTo(page, 640, box.y);
      await page.evaluate((y) => window.scrollTo({ top: y - 100, behavior: "smooth" }), box.y);
      await sleep(800);
    }
  }

  // Annotation: percentage rollout
  await showAnnotation(page, {
    text: "Percentage rollout \u2014 A/B/C test",
    near: ".detail-section:last-of-type .detail-card",
    position: "above",
    duration: 2500,
  });

  // --- Back to list ---
  console.log("Back to list...");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(400);
  await glideAndClick(page, ".flag-detail-back");
  await page.waitForSelector(".flag-table");
  await injectCursor(page);
  await sleep(800);

  // --- Click into password-policy (object variants) ---
  console.log("Opening password-policy detail...");
  await glideAndClick(page, '.flag-table a[href*="password-policy"]');
  await sleep(1500);

  // Scroll to variants
  const variantsH2 = page.locator("h2", { hasText: "Variants" });
  if ((await variantsH2.count()) > 0) {
    const box = await variantsH2.boundingBox();
    if (box) {
      await glideTo(page, 640, box.y);
      await page.evaluate((y) => window.scrollTo({ top: y - 80, behavior: "smooth" }), box.y);
      await sleep(800);
    }
  }
  await sleep(1500);

  // --- Back to list ---
  console.log("Back to list...");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(400);
  await glideAndClick(page, ".flag-detail-back");
  await page.waitForSelector(".flag-table");
  await injectCursor(page);
  await sleep(800);

  // --- Filter to disabled ---
  console.log("Filtering to disabled flags...");
  await glideAndClick(page, '.filter-btn:has-text("disabled")');
  await sleep(2000);

  // --- Back to all ---
  console.log("Showing all flags...");
  await glideAndClick(page, '.filter-btn:has-text("All")');
  await sleep(1500);

  await hideCursor(page);

  // =========================================================================
  // TITLE CARD: Outro
  // =========================================================================
  console.log("Title card: Outro");
  await showTitleCard(page, {
    lines: [
      { text: "flagd-ui", size: "2.6rem", mono: true, color: THEME.accent },
    ],
    subtitle: "Open source read-only UI for flagd.",
  });
  await sleep(3000);

  // =========================================================================
  // Finalize
  // =========================================================================
  console.log("Recording complete.");
  await page.close();
  await context.close();

  // Playwright saves video as .webm in the raw dir — grab the only file
  const { execSync } = await import("child_process");
  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith(".webm"));
  if (files.length > 0) {
    // Sort by mtime descending so we always pick the newest
    files.sort((a, b) => {
      return fs.statSync(path.join(rawDir, b)).mtimeMs - fs.statSync(path.join(rawDir, a)).mtimeMs;
    });
    const webmSrc = path.join(rawDir, files[0]);

    // Convert to GIF for README embedding.
    // Two-pass: generate palette first for better quality, then render.
    const gifOut = OUTPUT.replace(/\.webm$/, ".gif");
    const palettePath = path.join(rawDir, "palette.png");
    console.log("Converting to GIF...");
    execSync(
      `ffmpeg -y -i ${JSON.stringify(webmSrc)} -vf "fps=12,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" ${JSON.stringify(palettePath)}`,
      { stdio: "inherit" }
    );
    execSync(
      `ffmpeg -y -i ${JSON.stringify(webmSrc)} -i ${JSON.stringify(palettePath)} -lavfi "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" ${JSON.stringify(gifOut)}`,
      { stdio: "inherit" }
    );
    console.log(`GIF saved to ${gifOut}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
