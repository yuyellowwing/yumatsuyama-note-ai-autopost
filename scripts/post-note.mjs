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

// タイトル欄は note の仕様変更で placeholder が変わることがあるため複数候補を試す
async function fillTitle(text) {
  const selectors = [
    'textarea[placeholder="記事タイトル"]',
    '[data-placeholder="記事タイトル"]',
    '[placeholder="記事タイトル"]',
    'textarea[placeholder="タイトル"]',
    '[data-placeholder="タイトル"]',
    '[placeholder="タイトル"]',
    'textarea[placeholder*="タイトル"]',
    '[contenteditable="true"][data-placeholder*="タイトル"]',
    'h1[contenteditable="true"]',
  ];
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) === 0) continue;
    try {
      await el.waitFor({ state: "visible", timeout: 4000 });
      await el.click();
      await el.fill(text);
      console.log(`Title filled using: ${sel}`);
      return;
    } catch {
      /* 次の候補へ */
    }
  }
  throw new Error("Title field not found. note editor layout may have changed (or login expired).");
}

try {
  await page.goto("https://note.com/notes/new", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // ログイン切れの検出（URL と DOM の両方を確認）
  const loginFormVisible = await page
    .locator('input[type="password"], text=ログイン')
    .first()
    .isVisible()
    .catch(() => false);
  if (/login|signin/.test(page.url()) || loginFormVisible) {
    throw new Error("note login is required. The saved login (NOTE_STORAGE_STATE_B64) has expired. Please re-export it.");
  }

  await fillTitle(article.title);

  // 本文入力（ProseMirror エディタ）
  const bodyEditor = page.locator(".ProseMirror").first();
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
  // 失敗時はデバッグ情報とスクリーンショットを残す
  await fs.mkdir(new URL("../work/", import.meta.url), { recursive: true });
  console.error(`Failed at URL: ${page.url()}`);
  console.error(`Page title: ${await page.title().catch(() => "?")}`);
  await page.screenshot({ path: "work/note-post-error.png", fullPage: true }).catch(() => {});
  throw err;
} finally {
  await browser.close();
}
