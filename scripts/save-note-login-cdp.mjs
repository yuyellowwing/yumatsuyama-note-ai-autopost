import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const port = Number(process.env.CHROME_DEBUG_PORT || 9223);
const profileDir = new URL("../work/note-login-profile/", import.meta.url);
const statePath = new URL("../work/note-storage-state.json", import.meta.url);
const b64Path = new URL("../work/note-storage-state.b64", import.meta.url);

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

async function waitForVersion() {
  const url = `http://127.0.0.1:${port}/json/version`;
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Chrome debug port did not open.");
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
  });

  return {
    ready: new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    }),
    send(method, params = {}, sessionId) {
      const message = { id: ++id, method, params };
      if (sessionId) message.sessionId = sessionId;
      ws.send(JSON.stringify(message));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      ws.close();
    },
  };
}

await fs.mkdir(profileDir, { recursive: true });

const chrome = spawn(await chromePath(), [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${fileURLToPath(profileDir)}`,
  "--new-window",
  "https://note.com/login",
], { detached: true, stdio: "ignore" });
chrome.unref();

console.log("Chromeでnoteにログインしてください。ログインできたら、この画面に戻ってEnterを押してください。");
const rl = readline.createInterface({ input, output });
await rl.question("");
rl.close();

const version = await waitForVersion();
const client = cdp(version.webSocketDebuggerUrl);
await client.ready;

const { targetInfos } = await client.send("Target.getTargets");
const pageTarget = targetInfos.find((target) => target.type === "page" && target.url.includes("note.com"))
  || targetInfos.find((target) => target.type === "page");
if (!pageTarget) throw new Error("Could not find Chrome page target.");

const { sessionId } = await client.send("Target.attachToTarget", {
  targetId: pageTarget.targetId,
  flatten: true,
});

const { cookies } = await client.send("Storage.getCookies", {
  browserContextId: undefined,
});

const localStorageResult = await client.send("Runtime.evaluate", {
  expression: "JSON.stringify(Object.entries(localStorage).map(([name,value]) => ({name,value})))",
  returnByValue: true,
}, sessionId);

const localStorage = JSON.parse(localStorageResult.result.value || "[]");
const storageState = {
  cookies: cookies
    .filter((cookie) => cookie.domain.includes("note.com"))
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires || -1,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      sameSite: cookie.sameSite || "Lax",
    })),
  origins: [{ origin: "https://note.com", localStorage }],
};

await fs.writeFile(statePath, JSON.stringify(storageState, null, 2), "utf8");
await fs.writeFile(b64Path, Buffer.from(JSON.stringify(storageState)).toString("base64"), "utf8");
client.close();

console.log(`保存しました: ${fileURLToPath(statePath)}`);
console.log(`GitHubの NOTE_STORAGE_STATE_B64 には、このファイルの中身を入れます: ${fileURLToPath(b64Path)}`);
