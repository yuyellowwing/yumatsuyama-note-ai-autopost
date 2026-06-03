import fs from "node:fs/promises";
import { GoogleGenerativeAI } from "@google/generative-ai";

const outputPath = new URL("../work/today-note.json", import.meta.url);
const apiKey = (process.env.GEMINI_API_KEY || "").replace(/\s+/g, "");

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is empty. Please set it in GitHub Secrets.");
}

const genAI = new GoogleGenerativeAI(apiKey);

const prompt = `
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

const models = [process.env.GEMINI_MODEL || "gemini-2.0-flash", "gemini-1.5-flash"];

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
