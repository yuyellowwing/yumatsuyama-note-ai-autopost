import fs from "node:fs/promises";
import { chromium } from "playwright";

const articlePath = new URL("../work/today-note.json", import.meta.url);
const article = JSON.parse(await fs.readFile(articlePath, "utf8"));
const storageState = process.env.NOTE_STORAGE_STATE || "note-storage-state.json";

const browser = await chromium.launch({ headless: process.env.HEADLESS === "false" ? false : true });
const context = await browser.newContext({
  storageState,
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
});
const page = await context.newPage();

// タイトル欄候補（note のエディタ更新で placeholder が変わるため複数用意）
const TITLE_SELECTOR = [
  'textarea[placeholder="記事タイトル"]',
  '[data-placeholder="記事タイトル"]',
  'textarea[placeholder="タイトル"]',
  '[data-placeholder="タイトル"]',
  'textarea[placeholder*="タイトル"]',
  '[contenteditable="true"][data-placeholder*="タイトル"]',
  'h1[contenteditable="true"]',
].join(", ");

async function fillTitle(text) {
  const titleInput = page.locator(TITLE_SELECTOR).first();
  // エディタの読み込み完了を兼ねて、最大60秒待つ
  await titleInput.waitFor({ state: "visible", timeout: 60000 });
  await titleInput.click();
  try {
    await titleInput.fill(text);
  } catch {
    // contenteditable で fill が効かない場合はキーボード入力
    await titleInput.click();
    await page.keyboard.insertText(text);
  }
}

try {
  await page.goto("https://note.com/notes/new", { waitUntil: "domcontentloaded" });

  // ログイン切れ判定（URL とパスワード欄の有無のみで判定。誤検知を避ける）
  const passwordVisible = await page
    .locator('input[type="password"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (/\/login|signin/.test(page.url()) || passwordVisible) {
    throw new Error("note login is required. The saved login (NOTE_STORAGE_STATE_B64) has expired. Please re-export it.");
  }

  // タイトル（この待機でエディタ本体の読み込み完了を待つ）
  await fillTitle(article.title);

  // 本文（ProseMirror エディタ）。タイトル用とは別の最後の ProseMirror を狙う
  const bodyEditor = page.locator(".ProseMirror").last();
  await bodyEditor.waitFor({ state: "visible", timeout: 30000 });
  await bodyEditor.click();
  await page.waitForTimeout(800);
  await page.keyboard.insertText(article.body);

  await page.waitForTimeout(1500);

  // 公開に進む
  const proceedButton = page.getByRole("button", { name: "公開に進む", exact: true });
  await proceedButton.waitFor({ state: "visible", timeout: 30000 });
  await proceedButton.click();

  // 投稿する（モーダルのアニメーション待ち）
  const submitButton = page.getByRole("button", { name: "投稿する", exact: true });
  await submitButton.waitFor({ state: "visible", timeout: 30000 });
  await submitButton.click();

  await page.getByText(/作品の完成|記事をシェア|投稿しました|公開しました/).first().waitFor({
    state: "visible",
    timeout: 30000,
  });

  console.log(`Published: ${article.title}`);
} catch (err) {
  await fs.mkdir(new URL("../work/", import.meta.url), { recursive: true });
  console.error(`Failed at URL: ${page.url()}`);
  console.error(`Page title: ${await page.title().catch(() => "?")}`);
  await page.screenshot({ path: "work/note-post-error.png", fullPage: true }).catch(() => {});
  throw err;
} finally {
  await browser.close();
}
