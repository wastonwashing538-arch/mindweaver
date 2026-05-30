#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_URL =
  "https://www1.szu.edu.cn/board/infolist.asp?infotype=%C9%FA%BB%EE";
const DEFAULT_FROM = "2025-01-01";
const DEFAULT_TO = "2025-04-30";
const DEFAULT_DEPARTMENT = "传播学院";
const TOPIC_GROUPS = [
  {
    name: "新生适应与融入",
    keywords: ["新生适应", "适应与融入", "新生", "融入", "入学教育", "迎新"],
  },
  {
    name: "生涯规划",
    keywords: ["生涯规划", "职业规划", "职业发展", "就业指导", "求职", "简历"],
  },
  {
    name: "心理健康",
    keywords: ["心理健康", "心理", "情绪", "压力", "咨询", "心理辅导"],
  },
];

let cookie = "";

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startUrl = args.url ?? DEFAULT_URL;
  const maxPages = Number(args.pages ?? 1);
  const outputPath = args.out ?? "szu-board-life.json";
  const rawDir = args["raw-dir"];
  const delayMs = Number(args.delay ?? 500);
  const filters = {
    from: parseDateArg(args.from ?? DEFAULT_FROM, "--from"),
    to: parseDateArg(args.to ?? DEFAULT_TO, "--to"),
    department: String(args.department ?? DEFAULT_DEPARTMENT),
    enabled: args["no-filter"] !== true,
  };

  cookie = await loadCookie(args["cookie-file"]);

  const seenListUrls = new Set();
  const items = [];
  let nextUrl = startUrl;

  for (let page = 1; page <= maxPages && nextUrl; page += 1) {
    const html = await fetchHtml(nextUrl);
    await saveRaw(rawDir, `list-${page}.html`, html);

    const pageItems = extractListItems(html, nextUrl);
    for (const item of pageItems) {
      if (!seenListUrls.has(item.url)) {
        seenListUrls.add(item.url);
        items.push({ ...item, listPage: nextUrl });
      }
    }

    nextUrl = findNextPageUrl(html, nextUrl);
    if (nextUrl) {
      await sleep(delayMs);
    }
  }

  const records = [];
  for (const [index, item] of items.entries()) {
    await sleep(delayMs);
    const html = await fetchHtml(item.url);
    await saveRaw(rawDir, `detail-${index + 1}.html`, html);
    const notice = {
      ...item,
      detail: extractDetail(html),
    };
    const analysis = analyzeNotice(notice, filters);
    if (!filters.enabled || analysis.include) {
      records.push(toOutputRecord(notice, analysis));
    }
  }

  await writeOutput(outputPath, records);
  console.log(`Wrote ${records.length} notices to ${outputPath}`);
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
    return (await readFile(cookieFile, "utf8")).trim();
  }

  return "";
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; mindweaver-szu-board-scraper/1.0)",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });

  const finalUrl = response.url;
  const buffer = await response.arrayBuffer();
  const html = decodeHtml(buffer, response.headers.get("content-type"));

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  if (isLoginPage(finalUrl, html)) {
    throw new Error(
      [
        "The site returned the SZU unified authentication login page.",
        "Open the page in a logged-in browser, copy the request Cookie header,",
        "then run with SZU_COOKIE='...' or --cookie-file cookies.txt.",
      ].join(" "),
    );
  }

  return html;
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

function extractListItems(html, baseUrl) {
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [html];
  const items = [];

  for (const row of rows) {
    const links = extractLinks(row, baseUrl).filter((link) =>
      isBoardDetailUrl(link.url),
    );

    for (const link of links) {
      const rowText = htmlToText(row);
      items.push({
        title: link.text,
        url: link.url,
        date: extractDate(rowText),
        sourceText: rowText,
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
    if (!text) {
      continue;
    }

    links.push({
      text,
      url: new URL(href, baseUrl).toString(),
    });
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
  const title =
    htmlToText(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "") ||
    htmlToText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const text = htmlToText(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, ""),
  );

  return {
    title,
    date: extractDate(text),
    text,
  };
}

function extractDate(text) {
  const match =
    /20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}/.exec(text) ??
    /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/.exec(text);
  return normalizeDate(match?.[0]);
}

function analyzeNotice(notice, filters) {
  const date = normalizeDate(notice.detail.date ?? notice.date);
  const searchableText = [
    notice.title,
    notice.sourceText,
    notice.detail.title,
    notice.detail.text,
  ].join("\n");
  const matchedTopics = TOPIC_GROUPS.map((group) => {
    const matchedKeywords = group.keywords.filter((keyword) =>
      searchableText.includes(keyword),
    );
    return matchedKeywords.length > 0
      ? { name: group.name, keywords: matchedKeywords }
      : null;
  }).filter(Boolean);

  return {
    include:
      isDateInRange(date, filters.from, filters.to) &&
      searchableText.includes(filters.department) &&
      matchedTopics.length > 0,
    date,
    department: filters.department,
    departmentMatched: searchableText.includes(filters.department),
    matchedTopics,
  };
}

function toOutputRecord(notice, analysis) {
  const matchedKeywords = analysis.matchedTopics.flatMap((topic) => topic.keywords);
  return {
    date: analysis.date,
    title: notice.detail.title || notice.title,
    department: analysis.department,
    url: notice.url,
    matchedTopics: analysis.matchedTopics.map((topic) => topic.name),
    matchedKeywords: [...new Set(matchedKeywords)],
    excerpt: makeExcerpt(notice.detail.text, matchedKeywords),
  };
}

function makeExcerpt(text, keywords) {
  const compactText = text.replace(/\s+/g, " ").trim();
  const keyword = keywords.find((value) => compactText.includes(value));
  if (!keyword) {
    return compactText.slice(0, 160);
  }

  const index = compactText.indexOf(keyword);
  const start = Math.max(index - 60, 0);
  return compactText.slice(start, start + 180);
}

function parseDateArg(value, name) {
  const date = normalizeDate(String(value));
  if (!date) {
    throw new Error(`${name} must be a date like 2025-01-01`);
  }
  return date;
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
  return [
    year,
    month.padStart(2, "0"),
    day.padStart(2, "0"),
  ].join("-");
}

function isDateInRange(date, from, to) {
  return Boolean(date) && date >= from && date <= to;
}

async function writeOutput(outputPath, records) {
  const ext = path.extname(outputPath).toLowerCase();
  const content =
    ext === ".csv" ? toCsv(records) : `${JSON.stringify(records, null, 2)}\n`;
  await writeFile(outputPath, content, "utf8");
}

function toCsv(records) {
  const headers = [
    "date",
    "title",
    "department",
    "url",
    "matchedTopics",
    "matchedKeywords",
    "excerpt",
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

async function saveRaw(directory, filename, html) {
  if (!directory) {
    return;
  }

  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), html, "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
