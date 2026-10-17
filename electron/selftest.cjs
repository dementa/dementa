// Automated check of the Windows app (run with DEMENTA_SELFTEST=1).
// Boots Dementa OS in a hidden window, opens the browser, loads app-only sites inside it, tries
// an unapproved link, saves screenshots to DEMENTA_SELFTEST_OUT, prints results, then quits.

const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const OUT = process.env.DEMENTA_SELFTEST_OUT || path.join(app.getPath("temp"), "dementa-selftest");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(win) {
  fs.mkdirSync(OUT, { recursive: true });
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const shot = async (name) => {
    const image = await win.webContents.capturePage();
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, image.toPNG());
    console.log(`[selftest] screenshot ${file}`);
  };
  const typeAddress = (text) =>
    js(`(() => {
      const input = document.querySelector('input[aria-label="Address"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(input, ${JSON.stringify(text)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.form.requestSubmit();
    })()`);
  const pageText = () => js(`document.querySelector('[aria-label="Browser"]')?.innerText.slice(0, 300) ?? ""`);
  const webviewUrls = () => js(`[...document.querySelectorAll("webview")].map((w) => { try { return w.getURL(); } catch { return "(not ready)"; } })`);

  win.webContents.on("console-message", (event) => {
    if (event.level === "error" || event.level === "warning") console.log(`[renderer ${event.level}] ${event.message}`);
  });

  try {
    await new Promise((r) => win.webContents.once("did-finish-load", r));
    await wait(800);
    console.log(`[selftest] desktop bridge: ${await js("Boolean(window.dementa?.isDesktop)")}`);

    // Power on, skip boot, open the Browser app.
    await js(`document.querySelector('[aria-label="Turn on Dementa OS"]')?.click()`);
    await wait(500);
    await js(`document.querySelector('[aria-label^="Starting Dementa OS"]')?.click()`);
    await wait(800);
    await js(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Browser")
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))`);
    await wait(800);
    await js(`document.querySelector('[aria-label="Browser"] button[aria-label="Maximise"]')?.click()`);
    await wait(500);

    // 1. ChatGPT inside the Dementa browser.
    await typeAddress("chatgpt.com");
    await wait(12000);
    console.log(`[selftest] chatgpt webview urls: ${JSON.stringify(await webviewUrls())}`);
    await shot("1-chatgpt");

    // 2. A link inside the website to an unapproved address must be blocked.
    await js(`document.querySelector("webview").executeJavaScript("location.href = 'https://example.com/'")`);
    await wait(2500);
    console.log(`[selftest] after unapproved link: ${JSON.stringify(await pageText())}`);
    await shot("2-blocked-link");

    // 3. GitHub inside the Dementa browser.
    await typeAddress("github.com");
    await wait(9000);
    console.log(`[selftest] github webview urls: ${JSON.stringify(await webviewUrls())}`);
    await shot("3-github");

    // 4. Typing an unapproved address.
    await typeAddress("youtube.com");
    await wait(1000);
    console.log(`[selftest] typed youtube.com: ${JSON.stringify(await pageText())}`);
    console.log("[selftest] done");
  } catch (error) {
    console.log(`[selftest] FAILED: ${error.stack || error}`);
  } finally {
    app.quit();
  }
}

module.exports = { run };
