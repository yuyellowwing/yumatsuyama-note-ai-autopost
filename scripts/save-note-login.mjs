import { chromium } from "playwright";

const output = process.env.NOTE_STORAGE_STATE || "note-storage-state.json";
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto("https://note.com/login", { waitUntil: "domcontentloaded" });
console.log("noteにログインしてください。ログインできたら、この画面に戻ってEnterを押してください。");

process.stdin.resume();
process.stdin.once("data", async () => {
  await context.storageState({ path: output });
  await browser.close();
  console.log(`Saved login state to ${output}`);
  console.log("GitHub Secretsには、このファイルをbase64化した NOTE_STORAGE_STATE_B64 を保存します。");
  process.exit(0);
});
