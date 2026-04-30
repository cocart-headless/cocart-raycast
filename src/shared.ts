import { LocalStorage, Icon } from "@raycast/api";

const LLMS_FULL_URL = "https://docs.cocartapi.com/llms-full.txt";
const LLMS_TXT_URL = "https://docs.cocartapi.com/llms.txt";
const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/cocart-headless/cocart-api-documentation/refs/heads/main";
const HOOK_MDX_PATHS = [
  "/documentation/developers/actions",
  "/documentation/developers/filters",
  "/documentation/developers/functions",
  "/documentation/developers/jwt/actions",
  "/documentation/developers/jwt/filters",
];
const CACHE_KEY = "cocart-docs-cache";
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export interface DocEntry {
  title: string;
  url: string;
  description: string;
  content: string;
  category: string;
  version: string;
}

interface CachedData {
  entries: DocEntry[];
  timestamp: number;
}

export function categorizeFromUrl(url: string): string {
  if (url.includes("/api-reference/v2/cart/")) return "Cart";
  if (url.includes("/api-reference/v2/products/")) return "Products";
  if (url.includes("/api-reference/v2/sessions/")) return "Sessions";
  if (url.includes("/api-reference/v2/store/")) return "Store";
  if (url.includes("/api-reference/v2/user/")) return "User";
  if (url.includes("/api-reference/v2/variation")) return "Cart";
  if (url.includes("/api-reference/v1/cart/plus/")) return "Cart (Plus)";
  if (url.includes("/api-reference/v1/cart/")) return "Cart";
  if (url.includes("/api-reference/v1/products/")) return "Products";
  if (url.includes("/api-reference/v1/user/")) return "User";
  if (url.includes("/api-reference/v1/error")) return "Error Codes";
  if (url.includes("/api-reference/jwt/")) return "JWT";
  if (url.includes("/api-reference/plugins/")) return "Plugins";
  if (url.includes("/api-reference/")) return "API Reference";
  if (url.includes("/getting-started/jwt/")) return "JWT Setup";
  if (url.includes("/getting-started/")) return "Getting Started";
  if (url.includes("/tutorials/")) return "Tutorials";
  if (url.includes("/documentation/developers/jwt/actions"))
    return "JWT Action Hooks";
  if (url.includes("/documentation/developers/jwt/filters"))
    return "JWT Filters";
  if (url.includes("/documentation/developers/jwt/")) return "JWT Developers";
  if (url.includes("/documentation/developers/actions")) return "Action Hooks";
  if (url.includes("/documentation/developers/filters")) return "Filters";
  if (url.includes("/documentation/developers/functions")) return "Functions";
  if (url.includes("/documentation/developers/")) return "Developers";
  if (url.includes("/documentation/")) return "Documentation";
  if (url.includes("/knowledge-base/troubleshoot/")) return "Troubleshooting";
  if (url.includes("/knowledge-base/")) return "Knowledge Base";
  if (url.includes("/cli-reference/")) return "CLI Reference";
  if (url.includes("/breaking-changes/")) return "Breaking Changes";
  if (url.includes("/overview/")) return "Overview";
  if (url.includes("/plugins/")) return "Plugins";
  if (url.includes("/resources/")) return "Resources";
  if (url.includes("/updates/overview")) return "Overview";
  if (url.includes("/updates/")) return "Updates";
  return "Other";
}

export function versionFromUrl(url: string): string {
  if (url.includes("/api-reference/v1/")) return "v1";
  if (url.includes("/api-reference/v2/")) return "v2";
  if (url.includes("/api-reference/pre-release/")) return "pre-release";
  return "shared";
}

export function categoryIcon(category: string): Icon {
  switch (category) {
    case "Cart":
    case "Cart (Plus)":
      return Icon.Cart;
    case "Products":
      return Icon.Box;
    case "Sessions":
      return Icon.TwoPeople;
    case "Store":
      return Icon.Building;
    case "User":
      return Icon.Person;
    case "JWT":
    case "JWT Developers":
    case "JWT Setup":
      return Icon.Lock;
    case "API Reference":
    case "Error Codes":
      return Icon.Code;
    case "Getting Started":
      return Icon.Star;
    case "Tutorials":
      return Icon.Bookmark;
    case "Action Hooks":
    case "JWT Action Hooks":
      return Icon.Bolt;
    case "Filters":
    case "JWT Filters":
      return Icon.Filter;
    case "Functions":
      return Icon.CodeBlock;
    case "Developers":
      return Icon.Terminal;
    case "Documentation":
      return Icon.Book;
    case "Knowledge Base":
    case "Troubleshooting":
      return Icon.QuestionMark;
    case "CLI Reference":
      return Icon.Terminal;
    case "Breaking Changes":
      return Icon.Warning;
    case "Overview":
      return Icon.Info;
    case "Plugins":
      return Icon.Plug;
    case "Resources":
      return Icon.Link;
    case "Updates":
      return Icon.Bell;
    default:
      return Icon.Document;
  }
}

function parseLlmsTxt(text: string): Map<string, string> {
  const descriptions = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = line
      .trim()
      .match(/^-\s+\[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?$/);
    if (match && match[3]) {
      descriptions.set(match[2], match[3]);
    }
  }
  return descriptions;
}

function isContentSparse(content: string): boolean {
  const lines = content
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);
  return lines.length <= 2 || /openapi.*\.yaml\s/i.test(content);
}

function parseLlmsFullTxt(text: string): DocEntry[] {
  const seen = new Map<string, number>();
  const entries: DocEntry[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const titleMatch = lines[i].match(/^# (.+)$/);
    if (
      titleMatch &&
      i + 1 < lines.length &&
      lines[i + 1].startsWith("Source: ")
    ) {
      const title = titleMatch[1];
      const url = lines[i + 1].replace("Source: ", "").trim();
      i += 2;

      const contentLines: string[] = [];
      while (i < lines.length) {
        if (
          lines[i].match(/^# .+$/) &&
          i + 1 < lines.length &&
          lines[i + 1].startsWith("Source: ")
        ) {
          break;
        }
        contentLines.push(lines[i]);
        i++;
      }

      const content = contentLines.join("\n").trim();

      const existing = seen.get(url);
      if (existing !== undefined) {
        if (content.length > entries[existing].content.length) {
          entries[existing] = {
            title,
            url,
            description: "",
            content,
            category: categorizeFromUrl(url),
            version: versionFromUrl(url),
          };
        }
      } else {
        seen.set(url, entries.length);
        entries.push({
          title,
          url,
          description: "",
          content,
          category: categorizeFromUrl(url),
          version: versionFromUrl(url),
        });
      }
    } else {
      i++;
    }
  }

  return entries;
}

function mergeDescriptions(entries: DocEntry[], indexText: string): void {
  const rawDescriptions = parseLlmsTxt(indexText);
  const descriptions = new Map<string, string>();
  for (const [url, desc] of rawDescriptions) {
    descriptions.set(url.replace(/\.md$/, ""), desc);
  }
  for (const entry of entries) {
    const desc = descriptions.get(entry.url);
    if (desc) entry.description = desc;
    if (isContentSparse(entry.content) && desc) {
      entry.content = `${desc}\n\n---\n\n*To view the API specifications, open in browser for a full interactive reference.*`;
    }
  }
}

async function loadCachedEntries(): Promise<DocEntry[] | null> {
  const cached = await LocalStorage.getItem<string>(CACHE_KEY);
  if (!cached) return null;

  try {
    const data: CachedData = JSON.parse(cached);
    if (Date.now() - data.timestamp < CACHE_TTL) {
      return data.entries;
    }
  } catch {
    // Invalid cache
  }
  return null;
}

async function cacheEntries(entries: DocEntry[]): Promise<void> {
  const data: CachedData = { entries, timestamp: Date.now() };
  await LocalStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

async function fetchHookMdxSources(): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  await Promise.all(
    HOOK_MDX_PATHS.map(async (path) => {
      try {
        const res = await fetch(`${GITHUB_RAW_BASE}${path}.mdx`);
        if (res.ok) results.set(path, await res.text());
      } catch {
        // Non-fatal — fall back to llms-full.txt content
      }
    }),
  );
  return results;
}

export async function fetchAndParse(): Promise<DocEntry[]> {
  const [fullResponse, indexResponse, mdxSources] = await Promise.all([
    fetch(LLMS_FULL_URL),
    fetch(LLMS_TXT_URL),
    fetchHookMdxSources(),
  ]);
  if (!fullResponse.ok)
    throw new Error(`Failed to fetch docs: ${fullResponse.status}`);

  const parsed = parseLlmsFullTxt(await fullResponse.text());
  if (indexResponse.ok) {
    mergeDescriptions(parsed, await indexResponse.text());
  }

  // Replace hook entry content with the richer MDX source (which includes path= on ParamField)
  for (const entry of parsed) {
    const docPath = entry.url.replace("https://docs.cocartapi.com", "");
    const mdx = mdxSources.get(docPath);
    if (mdx) entry.content = mdx;
  }

  return parsed;
}

export async function loadEntries(): Promise<DocEntry[]> {
  const cached = await loadCachedEntries();
  if (cached) return cached;

  const parsed = await fetchAndParse();
  await cacheEntries(parsed);
  return parsed;
}

export async function refreshEntries(): Promise<DocEntry[]> {
  await LocalStorage.removeItem(CACHE_KEY);
  const parsed = await fetchAndParse();
  await cacheEntries(parsed);
  return parsed;
}

// --- Recent items tracking ---

const RECENT_KEY = "cocart-recent-docs";
const MAX_RECENT = 20;

export interface RecentItem {
  title: string;
  url: string;
  category: string;
  source: string; // which command: "docs" | "endpoints" | "hooks" | "errors"
  timestamp: number;
}

export async function getRecentItems(): Promise<RecentItem[]> {
  const stored = await LocalStorage.getItem<string>(RECENT_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export async function addRecentItem(
  item: Omit<RecentItem, "timestamp">,
): Promise<void> {
  const recent = await getRecentItems();
  const filtered = recent.filter((r) => r.url !== item.url);
  filtered.unshift({ ...item, timestamp: Date.now() });
  await LocalStorage.setItem(
    RECENT_KEY,
    JSON.stringify(filtered.slice(0, MAX_RECENT)),
  );
}

export function extractCode(content: string): string {
  const blocks: string[] = [];
  const regex = /```[\w]*[^\n]*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks.join("\n\n");
}

export function stripMdx(content: string): string {
  let result = content.replace(
    /<Accordion\s+[^>]*title="([^"]*)"[^>]*>/gi,
    "\n### $1\n",
  );
  result = result.replace(/<Tab\s+[^>]*title="([^"]*)"[^>]*>/gi, "\n**$1**\n");
  result = result.replace(/<Step\s+[^>]*title="([^"]*)"[^>]*>/gi, "\n**$1**\n");

  // Convert <ParamField> blocks into formatted parameter lines before stripping
  result = result.replace(
    /<ParamField\b[^>]*\bpath="([^"]*)"[^>]*\btype="([^"]*)"[^>]*>([\s\S]*?)<\/ParamField>/gi,
    (_m, path, type, body) => `\n\`${path}\` **${type}**\n${body.trim()}\n`,
  );
  result = result.replace(
    /<ParamField\b[^>]*\btype="([^"]*)"[^>]*\bpath="([^"]*)"[^>]*>([\s\S]*?)<\/ParamField>/gi,
    (_m, type, path, body) => `\n\`${path}\` **${type}**\n${body.trim()}\n`,
  );
  // ParamField with only type (no path/name) — still format the type
  result = result.replace(
    /<ParamField\b[^>]*\btype="([^"]*)"[^>]*>([\s\S]*?)<\/ParamField>/gi,
    (_m, type, body) => `\n**\`${type}\`** — ${body.trim()}\n`,
  );

  // Upgrade **Parameters** and **Usage** bold headings to proper ### headings
  result = result.replace(/^\*\*Parameters\*\*\s*$/gm, "### Parameters");
  result = result.replace(/^\*\*Usage\*\*\s*$/gm, "### Usage");

  // Convert inline Note/Info/Warning/Tip tags to blockquotes
  result = result.replace(
    /<(Note|Info|Warning|Tip)>([^<]*)<\/\1>/gi,
    (_m, _tag, body) => `> ${body.trim()}`,
  );
  // Multi-line Note/Info/Warning/Tip blocks
  result = result.replace(
    /<(Note|Info|Warning|Tip)>([\s\S]*?)<\/\1>/gi,
    (_m, _tag, body) =>
      body
        .trim()
        .split("\n")
        .map((l: string) => `> ${l.trim()}`)
        .join("\n"),
  );

  // Strip <span> tags but keep their text content
  result = result.replace(/<span[^>]*>([^<]*)<\/span>/gi, "$1");

  // Strip "Plugin: Label" lines — already visible in the hook name/section context
  result = result.replace(/^Plugin:\s*.+$/gm, "");

  result = result.replace(/<\/?[A-Z][A-Za-z]*[^>]*\/?>/g, "");
  result = result.replace(/<\/?aside[^>]*>/gi, "");
  result = result.replace(/<br\s*\/?>/g, "\n");

  result = result.replace(
    /^[ \t]*(```\w+)(?:[^\S\n]+[^\n]*)?\n([\s\S]*?)^[ \t]*```$/gm,
    (_, lang, body) => {
      const lines = body.split("\n");
      const indents = lines
        .filter((l: string) => l.trim().length > 0)
        .map((l: string) => l.match(/^([ \t]*)/)?.[1].length ?? 0);
      const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
      const dedented = lines.map((l: string) => l.slice(minIndent)).join("\n");
      return `${lang}\n${dedented}\`\`\``;
    },
  );

  const outputLines: string[] = [];
  let inCodeBlock = false;
  for (const line of result.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      outputLines.push(line);
    } else if (inCodeBlock) {
      outputLines.push(line);
    } else {
      outputLines.push(line.replace(/^[ \t]+/, ""));
    }
  }

  return outputLines.join("\n");
}
