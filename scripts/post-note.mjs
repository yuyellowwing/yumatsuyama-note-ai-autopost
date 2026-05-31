import fs from "node:fs/promises";
import { chromium } from "playwright";

const articlePath = new URL("../work/today-note.json", import.meta.url);
const article = JSON.parse(await fs.readFile(articlePath, "utf8"));
const storageState = process.env.NOTE_STORAGE_STATE || "note-storage-state.json";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState });
const page = await context.newPage();

async function clickByText(text) {
  const button = page.getByRole("button", { name: text }).first();
  await button.waitFor({ state: "visible", timeout: 15000 });
  await button.click();
}

try {
  await page.goto("https://note.com/notes/new", { waitUntil: "networkidle" });

  if (/login|signin/.test(page.url())) {
    throw new Error("note login is required. Refresh NOTE_STORAGE_STATE_B64.");
  }

  const titleField = page
    .locator('[placeholder="記事タイトル"], [data-placeholder="記事タイトル"], .editor-title, textarea[name="title"]')
    .first();
  await titleField.waitFor({ state: "visible", timeout: 15000 });
  await titleField.click();
  await titleField.fill(article.title);

  const bodyField = page.locator('.ProseMirror, [contenteditable="true"][class*="editor"], .note-editor__body [contenteditable]').first();
  await bodyField.waitFor({ state: "visible", timeout: 15000 });
  await bodyField.click();
  await page.keyboard.insertText(article.body);

  await page.waitForTimeout(1000);
  await clickByText("公開に進む");
  await clickByText("投稿する");

  await page.getByText(/作品の完成|記事をシェア|投稿しました|公開しました/).first().waitFor({
    state: "visible",
    timeout: 30000,
  });

  console.log(`Published: ${article.title}`);
} finally {
  await browser.close();
}
