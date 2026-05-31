import fs from "node:fs/promises";
import { chromium } from "playwright";

const articlePath = new URL("../work/today-note.json", import.meta.url);
const article = JSON.parse(await fs.readFile(articlePath, "utf8"));
const storageState = process.env.NOTE_STORAGE_STATE || "note-storage-state.json";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState,
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
});
const page = await context.newPage();

try {
  await page.goto("https://note.com/notes/new", { waitUntil: "networkidle" });

  if (/login|signin/.test(page.url())) {
    throw new Error("note login is required. Refresh NOTE_STORAGE_STATE_B64.");
  }

  // タイトル入力（Gemini推奨: getByPlaceholder が最も安定）
  const titleInput = page.getByPlaceholder("タイトル", { exact: true });
  await titleInput.waitFor({ state: "visible", timeout: 20000 });
  await titleInput.click();
  await titleInput.fill(article.title);

  // 本文入力（ProseMirrorエディタ）
  const bodyEditor = page.locator(".ProseMirror");
  await bodyEditor.waitFor({ state: "visible", timeout: 20000 });
  await bodyEditor.click();
  await page.waitForTimeout(500);
  await page.keyboard.insertText(article.body);

  await page.waitForTimeout(1000);

  // 公開に進む
  const proceedButton = page.getByRole("button", { name: "公開に進む", exact: true });
  await proceedButton.waitFor({ state: "visible", timeout: 20000 });
  await proceedButton.click();

  // 投稿する（モーダルのアニメーション待ち）
  const submitButton = page.getByRole("button", { name: "投稿する", exact: true });
  await submitButton.waitFor({ state: "visible", timeout: 20000 });
  await submitButton.click();

  await page.getByText(/作品の完成|記事をシェア|投稿しました|公開しました/).first().waitFor({
    state: "visible",
    timeout: 30000,
  });

  console.log(`Published: ${article.title}`);
} catch (err) {
  await fs.mkdir(new URL("../work/", import.meta.url), { recursive: true });
  await page.screenshot({ path: "work/note-post-error.png", fullPage: true }).catch(() => {});
  throw err;
} finally {
  await browser.close();
}
