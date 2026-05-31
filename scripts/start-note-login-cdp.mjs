import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const port = Number(process.env.CHROME_DEBUG_PORT || 9223);
const profileDir = new URL("../work/note-login-profile/", import.meta.url);

async function chromePath() {
  const paths = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ];
  for (const path of paths) {
    try {
      await fs.access(path);
      return path;
    } catch {}
  }
  throw new Error("Chrome was not found.");
}

await fs.mkdir(profileDir, { recursive: true });

const chrome = spawn(await chromePath(), [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${fileURLToPath(profileDir)}`,
  "--new-window",
  "https://note.com/login",
], { detached: true, stdio: "ignore" });

chrome.unref();
console.log("noteログイン用Chromeを開きました。ログインできたら、チャットで「ログインできた」と送ってください。");
