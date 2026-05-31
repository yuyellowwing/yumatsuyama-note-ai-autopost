import fs from "node:fs/promises";
import OpenAI from "openai";

const outputPath = new URL("../work/today-note.json", import.meta.url);
const apiKey = (process.env.OPENAI_API_KEY || "").replace(/\s+/g, "");

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is empty.");
}

if (!apiKey.startsWith("sk-")) {
  throw new Error("OPENAI_API_KEY does not look like an OpenAI API key. Please recreate the GitHub secret.");
}

const client = new OpenAI({ apiKey });

const prompt = `
YuMatsuyamaのnoteアカウント向けに、AIに関する最新情報を日本語で毎日発信する記事を作ってください。

条件:
- 直近24時間を中心に、重要度の高いAIニュースを扱う
- 公式発表、研究機関、主要AI企業、信頼できる技術メディアを優先する
- 未確認情報や噂は避ける
- 読者が短時間で価値を得られるようにする
- タイトルと本文を返す
- 本文には、冒頭の要約、重要トピック3件、背景、実務への示唆、今日の一言を含める
- 出典リンクを本文末尾に入れる
- 無料記事として自然に読めるトーンにする

返答はJSONだけにしてください。
{"title":"...","body":"..."}
`;

const model = process.env.OPENAI_MODEL || "gpt-4o";

function parseArticleJson(text) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) throw new Error("OpenAI response did not contain JSON.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

let article;

try {
  const response = await client.responses.create({
    model,
    input: prompt,
    tools: [{ type: "web_search_preview" }],
  });
  article = parseArticleJson(response.output_text || "");
} catch (err) {
  const message = String(err?.message || err);
  if (!message.includes("web_search") && !message.includes("Responses")) throw err;

  console.warn("Responses API web search unavailable, falling back to Chat Completions:", message);
  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });
  article = parseArticleJson(res.choices[0]?.message?.content || "");
}

if (!article.title || !article.body) {
  throw new Error("Article JSON must include title and body.");
}

await fs.mkdir(new URL("../work/", import.meta.url), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(article, null, 2), "utf8");
console.log(`Generated: ${article.title}`);
