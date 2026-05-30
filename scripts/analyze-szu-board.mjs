#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BOARD_URL =
  "https://www1.szu.edu.cn/board/infolist.asp?infotype=%C9%FA%BB%EE";
const DEFAULT_FROM = "2025-01-01";
const DEFAULT_TO = "2025-04-30";
const DEFAULT_DEPARTMENT = "传播学院";
const DEFAULT_LLM_BASE_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_LLM_MODEL = "deepseek-chat";

let boardCookie = "";

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = {
    startUrl: String(args.url ?? DEFAULT_BOARD_URL),
    pages: numberArg(args.pages ?? 10, "--pages"),
    out: String(args.out ?? "szu-board-semantic-analysis.csv"),
    rawDir: args["raw-dir"] ? String(args["raw-dir"]) : undefined,
    from: parseDateArg(args.from ?? DEFAULT_FROM, "--from"),
    to: parseDateArg(args.to ?? DEFAULT_TO, "--to"),
    department: String(args.department ?? DEFAULT_DEPARTMENT),
    delayMs: numberArg(args.delay ?? 500, "--delay"),
    llmBaseUrl: String(
      args["llm-base-url"] ??
        process.env.LLM_BASE_URL ??
        process.env.OPENAI_BASE_URL ??
        DEFAULT_LLM_BASE_URL,
    ),
    llmModel: String(args["llm-model"] ?? process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL),
    apiKey:
      process.env[String(args["api-key-env"] ?? "DEEPSEEK_API_KEY")] ??
      process.env.OPENAI_API_KEY,
    keepAll: args["keep-all"] === true,
  };

  if (!config.apiKey) {
    throw new Error(
      "Missing LLM API key. Set DEEPSEEK_API_KEY or OPENAI_API_KEY, or pass --api-key-env NAME.",
    );
  }

  boardCookie = await loadCookie(args["cookie-file"]);
  const notices = await crawlBoard(config);
  const candidateNotices = notices.filter((notice) =>
    isDateInRange(notice.date, config.from, config.to),
  );

  const records = [];
  for (const [index, notice] of candidateNotices.entries()) {
    await sleep(config.delayMs);
    console.log(
      `Analyzing ${index + 1}/${candidateNotices.length}: ${notice.date} ${notice.title}`,
    );
    const analysis = await classifyNotice(notice, config);
    if (config.keepAll || analysis.include) {
      records.push(toRecord(notice, analysis));
    }
  }

  await writeOutput(config.out, records);
  console.log(`Wrote ${records.length} records to ${config.out}`);
}

async function crawlBoard(config) {
  const listItems = [];
  const seenUrls = new Set();
  let nextUrl = config.startUrl;

  for (let page = 1; page <= config.pages && nextUrl; page += 1) {
    const html = await fetchBoardHtml(nextUrl);
    await saveRaw(config.rawDir, `list-${page}.html`, html);

    for (const item of extractListItems(html, nextUrl)) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        listItems.push({ ...item, listPage: nextUrl });
      }
    }

    nextUrl = findNextPageUrl(html, nextUrl);
    if (nextUrl) {
      await sleep(config.delayMs);
    }
  }

  const notices = [];
  for (const [index, item] of listItems.entries()) {
    await sleep(config.delayMs);
    const html = await fetchBoardHtml(item.url);
    await saveRaw(config.rawDir, `detail-${index + 1}.html`, html);
    const detail = extractDetail(html);
    notices.push({
      title: detail.title || item.title,
      date: normalizeDate(detail.date ?? item.date),
      url: item.url,
      listPage: item.listPage,
      listText: item.sourceText,
      text: detail.text,
    });
  }

  return notices;
}

async function fetchBoardHtml(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; szu-board-semantic-analyzer/1.0)",
      ...(boardCookie ? { Cookie: boardCookie } : {}),
    },
  });

  const buffer = await response.arrayBuffer();
  const html = decodeHtml(buffer, response.headers.get("content-type"));

  if (!response.ok) {
    throw new Error(`Board request failed: ${response.status} ${response.statusText}`);
  }

  if (isLoginPage(response.url, html)) {
    throw new Error(
      [
        "The board returned the SZU unified authentication login page.",
        "Log in in a browser, copy the request Cookie header, then run with",
        "SZU_COOKIE='...' or --cookie-file cookies.txt.",
      ].join(" "),
    );
  }

  return html;
}

async function classifyNotice(notice, config) {
  const prompt = buildClassificationPrompt(notice, config);
  const response = await fetch(config.llmBaseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.llmModel,
      messages: [
        {
          role: "system",
          content:
            "你是高校学生工作通知的研究助理。你只基于给定公文正文判断，不臆测，不因为标题缺少关键词而排除。必须输出严格 JSON。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  const json = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(
      `LLM request failed: ${response.status} ${response.statusText} ${JSON.stringify(json)}`,
    );
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM response did not include message content.");
  }

  return normalizeAnalysis(JSON.parse(content));
}

function buildClassificationPrompt(notice, config) {
  const clippedText = clip(notice.text, 9000);
  return `请判断下面这篇深圳大学公文通文章，是否应纳入研究样本。

筛选目标：
1. 日期在 ${config.from} 至 ${config.to}。当前文章日期：${notice.date ?? "未知"}。
2. 文章发布单位、承办单位、面向对象或正文内容与“${config.department}”有关。
3. 文章主题与以下任一方向实质相关：
   - 新生适应与融入：入学适应、校园融入、班级/学院归属、朋辈支持、适应性教育、人际适应等。
   - 生涯规划：职业探索、学业与职业路径、就业能力、升学/就业选择、简历面试、职业发展等。
   - 心理健康：心理调适、情绪压力、心理危机预防、心理咨询、生命教育、心理健康教育等。

判断要求：
- 不要只看标题。标题没有出现主题词时，也要根据正文活动目的、对象、内容来判断。
- “include” 只有在同时满足“传播学院相关”和“至少一个主题实质相关”时才为 true。
- 如果只是普通文体活动、讲座、竞赛、通知，且无法说明与上述三个方向实质相关，应为 false。
- 如果证据不足，include=false，并说明缺什么证据。

请输出严格 JSON，不要 Markdown：
{
  "include": boolean,
  "departmentRelated": boolean,
  "topics": ["新生适应与融入" | "生涯规划" | "心理健康"],
  "confidence": 0 到 1 的数字,
  "reason": "用中文简要说明纳入或排除理由",
  "evidence": ["引用或概括正文中的关键证据，最多3条"]
}

文章标题：${notice.title}
文章链接：${notice.url}
列表文字：${notice.listText}
正文：
${clippedText}`;
}

function normalizeAnalysis(raw) {
  const allowedTopics = new Set(["新生适应与融入", "生涯规划", "心理健康"]);
  const topics = Array.isArray(raw.topics)
    ? raw.topics.filter((topic) => allowedTopics.has(topic))
    : [];

  return {
    include: Boolean(raw.include),
    departmentRelated: Boolean(raw.departmentRelated),
    topics,
    confidence: typeof raw.confidence === "number" ? raw.confidence : undefined,
    reason: String(raw.reason ?? ""),
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence.map((item) => String(item)).slice(0, 3)
      : [],
  };
}

function toRecord(notice, analysis) {
  return {
    date: notice.date,
    title: notice.title,
    url: notice.url,
    include: analysis.include,
    departmentRelated: analysis.departmentRelated,
    topics: analysis.topics,
    confidence: analysis.confidence,
    reason: analysis.reason,
    evidence: analysis.evidence,
  };
}

function extractListItems(html, baseUrl) {
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [html];
  const items = [];

  for (const row of rows) {
    const links = extractLinks(row, baseUrl).filter((link) =>
      isBoardDetailUrl(link.url),
    );

    for (const link of links) {
      items.push({
        title: link.text,
        url: link.url,
        date: extractDate(htmlToText(row)),
        sourceText: htmlToText(row),
      });
    }
  }

  return dedupeBy(items, (item) => item.url);
}

function extractLinks(html, baseUrl) {
  const links = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html))) {
    const attrs = match[1];
    const href = /href\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1];
    if (!href || href.startsWith("javascript:") || href.startsWith("#")) {
      continue;
    }

    const text = htmlToText(match[2]);
    if (text) {
      links.push({ text, url: new URL(href, baseUrl).toString() });
    }
  }

  return links;
}

function isBoardDetailUrl(url) {
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.includes("/board/") &&
    !lowerUrl.includes("infolist.asp") &&
    !lowerUrl.includes("javascript:")
  );
}

function findNextPageUrl(html, baseUrl) {
  const nextLink = extractLinks(html, baseUrl).find((link) =>
    /^(下一页|下页|next|>)$/i.test(link.text.trim()),
  );
  return nextLink?.url;
}

function extractDetail(html) {
  const cleanHtml = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const title =
    htmlToText(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(cleanHtml)?.[1] ?? "") ||
    htmlToText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(cleanHtml)?.[1] ?? "");
  const text = htmlToText(cleanHtml);

  return {
    title,
    date: extractDate(text),
    text,
  };
}

function decodeHtml(buffer, contentType) {
  const bytes = new Uint8Array(buffer);
  const preview = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const charset =
    /charset=["']?([a-zA-Z0-9_-]+)/i.exec(contentType ?? "")?.[1] ??
    /<meta[^>]+charset=["']?([a-zA-Z0-9_-]+)/i.exec(preview)?.[1] ??
    /<meta[^>]+content=["'][^"']*charset=([a-zA-Z0-9_-]+)/i.exec(preview)?.[1] ??
    "gb18030";

  return new TextDecoder(normalizeCharset(charset), { fatal: false }).decode(bytes);
}

function normalizeCharset(charset) {
  const normalized = charset.toLowerCase();
  if (["gb2312", "gbk", "gb18030"].includes(normalized)) {
    return "gb18030";
  }
  return normalized;
}

function isLoginPage(url, html) {
  return (
    url.includes("/authserver/") ||
    html.includes("统一身份认证平台") ||
    html.includes("authserver")
  );
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const nextValue = argv[index + 1];
    if (inlineValue !== undefined) {
      parsed[rawKey] = inlineValue;
    } else if (nextValue && !nextValue.startsWith("--")) {
      parsed[rawKey] = nextValue;
      index += 1;
    } else {
      parsed[rawKey] = true;
    }
  }
  return parsed;
}

async function loadCookie(cookieFile) {
  if (process.env.SZU_COOKIE) {
    return process.env.SZU_COOKIE.trim();
  }

  if (cookieFile) {
    return (await readFile(String(cookieFile), "utf8")).trim();
  }

  return "";
}

function numberArg(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} must be a number.`);
  }
  return number;
}

function parseDateArg(value, name) {
  const date = normalizeDate(String(value));
  if (!date) {
    throw new Error(`${name} must be a date like 2025-01-01.`);
  }
  return date;
}

function extractDate(text) {
  const match =
    /20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}/.exec(text) ??
    /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/.exec(text);
  return normalizeDate(match?.[0]);
}

function normalizeDate(value) {
  if (!value) {
    return undefined;
  }

  const match = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(value);
  if (!match) {
    return undefined;
  }

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function isDateInRange(date, from, to) {
  return Boolean(date) && date >= from && date <= to;
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|td|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeBy(values, keyFn) {
  const seen = new Set();
  const deduped = [];
  for (const value of values) {
    const key = keyFn(value);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(value);
    }
  }
  return deduped;
}

async function writeOutput(outputPath, records) {
  const ext = path.extname(outputPath).toLowerCase();
  const content =
    ext === ".json" ? `${JSON.stringify(records, null, 2)}\n` : toCsv(records);
  await writeFile(outputPath, content, "utf8");
}

function toCsv(records) {
  const headers = [
    "date",
    "title",
    "url",
    "include",
    "departmentRelated",
    "topics",
    "confidence",
    "reason",
    "evidence",
  ];
  const rows = records.map((record) =>
    headers.map((header) => csvCell(record[header])).join(","),
  );
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

async function saveRaw(directory, filename, html) {
  if (!directory) {
    return;
  }

  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), html, "utf8");
}

function clip(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}\n\n[正文已截断，原文更长]`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
