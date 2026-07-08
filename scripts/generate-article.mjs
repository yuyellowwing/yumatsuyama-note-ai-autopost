import fs from "node:fs/promises";
import { GoogleGenerativeAI } from "@google/generative-ai";

const outputPath = new URL("../work/today-note.json", import.meta.url);
const apiKey = (process.env.GEMINI_API_KEY || "").replace(/\s+/g, "");

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is empty. Please set it in GitHub Secrets.");
}

const genAI = new GoogleGenerativeAI(apiKey);

// ---------------------------------------------------------------------------
// Fresh sources: pull real, current AI news from RSS feeds and ground the
// article in them. Gemini alone has no web access, so without this the
// "latest news" and the source links came from its months-old training data.
// ---------------------------------------------------------------------------

const FEEDS = [
  { name: "ITmedia AI+", url: "https://rss.itmedia.co.jp/rss/2.0/aiplus.xml" },
  {
    name: "Googleニュース(生成AI)",
    url: "https://news.google.com/rss/search?q=%E7%94%9F%E6%88%90AI%20OR%20OpenAI%20OR%20Anthropic%20OR%20Gemini&hl=ja&gl=JP&ceid=JP:ja",
  },
];

const MAX_ITEMS = 12;
const MAX_AGE_HOURS = 48;

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

function parseRssItems(xml, feedName) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const title = tag(block, "title");
    const link = tag(block, "link");
    const pubDate = new Date(tag(block, "pubDate"));
    const description = tag(block, "description").replace(/<[^>]+>/g, "").slice(0, 200);
    const source = tag(block, "source") || feedName;
    if (title && link && !Number.isNaN(pubDate.getTime())) {
      items.push({ title, link, pubDate, description, source });
    }
  }
  return items;
}

async function fetchFreshNews() {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const res = await fetch(f.url, {
        signal: AbortSignal.timeout(20000),
        headers: { "User-Agent": "note-daily-post (RSS reader)" },
      });
      if (!res.ok) throw new Error(`${f.name}: HTTP ${res.status}`);
      return parseRssItems(await res.text(), f.name);
    })
  );
  const all = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`RSS ok: ${FEEDS[i].name} -> ${r.value.length} items`);
      all.push(...r.value);
    } else {
      console.warn(`RSS failed: ${FEEDS[i].name} -> ${r.reason}`);
    }
  });

  const cutoff = Date.now() - MAX_AGE_HOURS * 3600 * 1000;
  const seen = new Set();
  return all
    .filter((n) => n.pubDate.getTime() >= cutoff)
    .sort((a, b) => b.pubDate - a.pubDate)
    .filter((n) => {
      const key = n.title.replace(/\s+/g, "").slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ITEMS);
}

function jstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function jstStamp(d) {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);
}

function buildGroundedPrompt(news) {
  const list = news
    .map(
      (n, i) =>
        `${i + 1}. ${n.title} | ${n.source} | ${jstStamp(n.pubDate)} JST | ${n.link}\n   概要: ${n.description}`
    )
    .join("\n");
  return `
今日は${jstToday()}です。
YuMatsuyamaのnoteアカウント向けに、AIに関する最新情報を日本語で毎日発信する記事を作ってください。

以下は、たった今RSSから取得した「実在する最新ニュースの一覧」です(番号. タイトル | 媒体 | 日時 | URL):
${list}

条件:
- 上の一覧から重要度の高いニュースを3件選び、「重要トピック3件」として扱う
- 事実関係は上の一覧にある情報だけを根拠にする(憶測や、一覧にない出来事を足さない)
- 出典リンクは上の一覧のURLを一字一句そのまま使う(それ以外のURLを作らない)
- 読者が短時間で価値を得られるようにする
- タイトルと本文を返す
- 本文には、冒頭の要約、重要トピック3件、背景、実務への示唆、今日の一言を含める
- 出典リンクを本文末尾に入れる
- 無料記事として自然に読めるトーンにする

返答はJSONだけにしてください。
{"title":"...","body":"..."}
`;
}

// Legacy prompt — used only if every RSS feed fails, so the daily post never
// stops. (Articles written this way rely on the model's memory, not live news.)
const FALLBACK_PROMPT = `
YuMatsuyamaのnoteアカウント向けに、AIに関する最新情報を日本語で毎日発信する記事を作ってください。

条件:
- 重要度の高いAIニュースや動向を扱う
- 公式発表、研究機関、主要AI企業、信頼できる技術メディアの情報を優先する
- 未確認情報や噂は避ける
- 読者が短時間で価値を得られるようにする
- タイトルと本文を返す
- 本文には、冒頭の要約、重要トピック3件、背景、実務への示唆、今日の一言を含める
- 出典リンクを本文末尾に入れる
- 無料記事として自然に読めるトーンにする

返答はJSONだけにしてください。
{"title":"...","body":"..."}
`;

function parseArticleJson(text) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) throw new Error("Gemini response did not contain JSON.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function readableGeminiError(err) {
  const message = String(err?.message || err);
  if (message.includes("API_KEY_INVALID") || message.includes("API key not valid")) {
    return new Error("GEMINI_API_KEY was rejected. Please recreate the GitHub secret with a valid Gemini API key.");
  }
  if (message.includes("429") || message.includes("quota") || message.includes("RESOURCE_EXHAUSTED")) {
    return new Error("Gemini free quota reached for now. Try again later.");
  }
  return err;
}

let news = [];
try {
  news = await fetchFreshNews();
} catch (err) {
  console.warn(`fetchFreshNews failed entirely: ${String(err?.message || err)}`);
}

const prompt = news.length >= 3 ? buildGroundedPrompt(news) : FALLBACK_PROMPT;
console.log(
  news.length >= 3
    ? `Grounding article in ${news.length} fresh news items (newest: ${jstStamp(news[0].pubDate)} JST)`
    : "WARNING: not enough fresh news from RSS -> falling back to ungrounded prompt"
);

const models = [process.env.GEMINI_MODEL || "gemini-2.5-flash", "gemini-flash-latest"];

let article;
let lastErr;

for (const modelName of models) {
  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: "application/json" },
    });
    const result = await model.generateContent(prompt);
    article = parseArticleJson(result.response.text());
    console.log(`Generated with model: ${modelName}`);
    break;
  } catch (err) {
    lastErr = err;
    console.warn(`Model ${modelName} failed: ${String(err?.message || err)}`);
  }
}

if (!article) {
  throw readableGeminiError(lastErr || new Error("All Gemini models failed."));
}

if (!article.title || !article.body) {
  throw new Error("Article JSON must include title and body.");
}

await fs.mkdir(new URL("../work/", import.meta.url), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(article, null, 2), "utf8");
console.log(`Generated: ${article.title}`);
