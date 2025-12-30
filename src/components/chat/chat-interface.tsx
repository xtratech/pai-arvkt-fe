"use client";

import Link from "next/link";
import PlureeLogo from "@/assets/icons/PlureeLogo";
import SendIcon from "@/assets/icons/SendIcon";
import { useSearchParams } from "next/navigation";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import { fetchSessionDetail, type SessionConfig } from "@/services/sessions";
import {
  isAsyncJobResponse,
  pollChatJob,
  startChat,
  type AsyncJobResponse,
  type ChatSyncResponse,
} from "@/services/chat-async-jobs";
import { recordUserWalletUsage } from "@/services/user-wallet";
import { useUser } from "@/contexts/user-context";
import { buildBearerTokenFromTokens } from "@/lib/auth-headers";
import ReactMarkdown, { type Components as MarkdownComponents } from "react-markdown";
import {
  Children,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Sender = "user" | "bot";

type UsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

type ChatMessage = {
  id: string;
  text: string;
  sender: Sender;
  suggestions?: string[];
  usageMetadata?: UsageMetadata | null;
};

type ChatSeedMessage = {
  text: string;
  sender?: Sender;
  suggestions?: string[];
};

type SourceSegment = {
  text: string;
  source_id: string | null;
  source_title?: string | null;
};

type KbAnalyzerResponsePayload = {
  segments?: Array<{
    segment_text?: string;
    source_id?: string | null;
    source_title?: string | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

type SourceModalState =
  | { mode: "edit"; sourceId: string; sourceTitle: string | null }
  | { mode: "create"; sourceId: null; sourceTitle: null; seedText: string };

type SourceOpenRequest =
  | { mode: "edit"; sourceId: string; sourceTitle?: string | null }
  | { mode: "create"; seedText: string };

type StatusEvent = CustomEvent<{ message?: string }>;

type AttributionPluginOptions = {
  segments: SourceSegment[];
};

type HastNode = {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function rehypeAttributionSegments(options?: AttributionPluginOptions) {
  const segments = options?.segments ?? [];
  if (!Array.isArray(segments) || segments.length === 0) return;

  return (tree: HastNode) => {
    let segmentIndex = 0;
    let segmentOffset = 0;

    const normalizeComparableChar = (input: string) => {
      switch (input) {
        case "\r":
          return "\n";
        case "\u00a0":
          return " ";
        case "\u2018":
        case "\u2019":
          return "'";
        case "\u201c":
        case "\u201d":
          return '"';
        case "\u2013":
        case "\u2014":
          return "-";
        default:
          return input;
      }
    };

    const isWhitespace = (input: string | null) => (input ? /\s/.test(input) : false);

    const ensureSegmentPointer = () => {
      while (segmentIndex < segments.length && segmentOffset >= segments[segmentIndex].text.length) {
        segmentIndex += 1;
        segmentOffset = 0;
      }
      while (segmentIndex < segments.length && segments[segmentIndex].text.length === 0) {
        segmentIndex += 1;
        segmentOffset = 0;
      }
    };

    const snapshotPointer = () => ({ segmentIndex, segmentOffset });

    const restorePointer = (snapshot: { segmentIndex: number; segmentOffset: number }) => {
      segmentIndex = snapshot.segmentIndex;
      segmentOffset = snapshot.segmentOffset;
    };

    const peekChar = () => {
      ensureSegmentPointer();
      if (segmentIndex >= segments.length) return null;
      return segments[segmentIndex].text[segmentOffset] ?? null;
    };

    const peekChars = (count: number) => {
      let remaining = count;
      let idx = segmentIndex;
      let offset = segmentOffset;
      let result = "";
      while (remaining > 0 && idx < segments.length) {
        const text = segments[idx].text;
        const slice = text.slice(offset, offset + remaining);
        result += slice;
        remaining -= slice.length;
        if (remaining <= 0) break;
        idx += 1;
        offset = 0;
      }
      return result;
    };

    const advanceChar = () => {
      ensureSegmentPointer();
      if (segmentIndex >= segments.length) return;
      segmentOffset += 1;
      ensureSegmentPointer();
    };

    const advanceBy = (count: number) => {
      for (let i = 0; i < count; i += 1) {
        if (segmentIndex >= segments.length) break;
        advanceChar();
      }
    };

    const getPreviousChar = () => {
      if (segmentIndex === 0 && segmentOffset === 0) return null;
      if (segmentOffset > 0) {
        return segments[segmentIndex]?.text[segmentOffset - 1] ?? null;
      }
      const prevSegment = segments[segmentIndex - 1];
      if (!prevSegment) return null;
      return prevSegment.text[prevSegment.text.length - 1] ?? null;
    };

    const isLineStart = () => {
      const prev = getPreviousChar();
      if (prev == null) return true;
      return prev === "\n" || prev === "\r";
    };

    const skipUntilChar = (target: string, maxSteps = 2000) => {
      let steps = 0;
      while (steps < maxSteps) {
        const current = peekChar();
        if (current == null) return false;
        if (current === target) return true;
        advanceChar();
        steps += 1;
      }
      return false;
    };

    const trySkipMarkdownLinkTarget = () => {
      const firstTwo = peekChars(2);
      if (firstTwo === "](") {
        advanceBy(2);
        const found = skipUntilChar(")");
        if (found) advanceChar();
        return true;
      }
      if (firstTwo === "][") {
        advanceBy(2);
        const found = skipUntilChar("]");
        if (found) advanceChar();
        return true;
      }
      return false;
    };

    const trySkipMarkdownImage = () => {
      const firstTwo = peekChars(2);
      if (firstTwo !== "![") return false;
      advanceBy(2);
      const foundAlt = skipUntilChar("]");
      if (foundAlt) advanceChar();
      if (peekChar() === "(") {
        advanceChar();
        const foundUrl = skipUntilChar(")");
        if (foundUrl) advanceChar();
      }
      return true;
    };

    const trySkipMarkdownLinePrefix = () => {
      if (!isLineStart()) return false;

      if (peekChars(3) === "```" || peekChars(3) === "~~~") {
        advanceBy(3);
        const found = skipUntilChar("\n");
        if (found) advanceChar();
        return true;
      }

      const current = peekChar();
      if (!current) return false;

      if (current === "#") {
        while (peekChar() === "#") advanceChar();
        if (peekChar() === " ") advanceChar();
        return true;
      }

      if (current === ">") {
        advanceChar();
        if (peekChar() === " ") advanceChar();
        return true;
      }

      if (current === "-" || current === "*" || current === "+") {
        const snapshot = snapshotPointer();
        advanceChar();
        if (peekChar() === " ") {
          advanceChar();
          return true;
        }
        restorePointer(snapshot);
        return false;
      }

      if (/\d/.test(current)) {
        const snapshot = snapshotPointer();
        while (true) {
          const digit = peekChar();
          if (!digit || !/\d/.test(digit)) break;
          advanceChar();
        }
        const suffix = peekChar();
        if (suffix === "." || suffix === ")") {
          advanceChar();
          if (peekChar() === " ") advanceChar();
          return true;
        }
        restorePointer(snapshot);
      }

      return false;
    };

    const trySkipSkippableChar = () => {
      const current = peekChar();
      if (!current) return false;
      if (current === "*" || current === "_" || current === "`" || current === "~") {
        advanceChar();
        return true;
      }
      if (current === "<" || current === ">") {
        advanceChar();
        return true;
      }
      return false;
    };

    const alignSegmentToNodeChar = (nodeChar: string) => {
      if (segmentIndex >= segments.length) return false;
      const target = normalizeComparableChar(nodeChar);
      if (isWhitespace(target)) return true;

      let steps = 0;
      while (steps < 2000) {
        const current = peekChar();
        if (current == null) return false;

        const normalized = normalizeComparableChar(current);
        if (normalized === target) return true;

        if (trySkipMarkdownLinkTarget()) {
          steps += 1;
          continue;
        }

        if (trySkipMarkdownImage()) {
          steps += 1;
          continue;
        }

        if (trySkipMarkdownLinePrefix()) {
          steps += 1;
          continue;
        }

        if (isWhitespace(normalized)) {
          advanceChar();
          steps += 1;
          continue;
        }

        if (trySkipSkippableChar()) {
          steps += 1;
          continue;
        }

        // Best-effort: skip over unmatched markdown punctuation without stalling.
        if (normalized === "[" || normalized === "]" || normalized === "(" || normalized === ")" || normalized === "!") {
          advanceChar();
          steps += 1;
          continue;
        }

        return false;
      }

      return false;
    };

    const makeSegmentSpan = (value: string, segment: SourceSegment | null) => {
      const properties: Record<string, unknown> = { "data-attrib-seg": "1" };
      if (segment?.source_id) {
        properties["data-source-id"] = segment.source_id;
      }
      if (segment?.source_title) {
        properties["data-source-title"] = segment.source_title;
      }
      return {
        type: "element",
        tagName: "span",
        properties,
        children: [{ type: "text", value }],
      } satisfies HastNode;
    };

    const splitTextWithSegments = (value: string) => {
      const nodes: HastNode[] = [];
      let buffer = "";
      let bufferSegment: SourceSegment | null = null;
      let bufferSegmentIndex: number | null = null;

      const flush = () => {
        if (!buffer) return;
        nodes.push(makeSegmentSpan(buffer, bufferSegment));
        buffer = "";
        bufferSegment = null;
        bufferSegmentIndex = null;
      };

      for (let i = 0; i < value.length; i += 1) {
        const char = value[i];
        ensureSegmentPointer();
        let activeSegmentIndex = segmentIndex < segments.length ? segmentIndex : null;
        let activeSegment = activeSegmentIndex != null ? segments[activeSegmentIndex] : null;

        if (segmentIndex < segments.length) {
          if (isWhitespace(char)) {
            activeSegmentIndex = segmentIndex < segments.length ? segmentIndex : null;
            activeSegment = activeSegmentIndex != null ? segments[activeSegmentIndex] : null;
            const segChar = peekChar();
            if (segChar && isWhitespace(segChar)) {
              advanceChar();
            }
          } else {
            const aligned = alignSegmentToNodeChar(char);
            if (!aligned) {
              // Fall back to unsegmented rendering for the remainder of this node.
              flush();
              nodes.push({ type: "text", value: value.slice(i) });
              return nodes;
            }
            ensureSegmentPointer();
            activeSegmentIndex = segmentIndex < segments.length ? segmentIndex : null;
            activeSegment = activeSegmentIndex != null ? segments[activeSegmentIndex] : null;
            advanceChar();
          }
        }

        if (bufferSegmentIndex !== activeSegmentIndex) {
          flush();
          bufferSegment = activeSegment;
          bufferSegmentIndex = activeSegmentIndex;
        }
        buffer += char;
      }

      flush();
      return nodes;
    };

    const consumeTextWithoutWrapping = (value: string) => {
      for (let i = 0; i < value.length; i += 1) {
        const char = value[i];
        ensureSegmentPointer();
        if (segmentIndex >= segments.length) break;

        if (isWhitespace(char)) {
          const segChar = peekChar();
          if (segChar && isWhitespace(segChar)) {
            advanceChar();
          }
          continue;
        }

        const aligned = alignSegmentToNodeChar(char);
        if (!aligned) return;
        advanceChar();
      }
    };

    const transform = (node: HastNode, insideCode: boolean) => {
      if (!node.children || node.children.length === 0) return;
      const children = node.children;
      const nextChildren: HastNode[] = [];

      for (const child of children) {
        if (!child) continue;
        if (child.type === "text" && typeof child.value === "string") {
          if (insideCode) {
            consumeTextWithoutWrapping(child.value);
            nextChildren.push(child);
          } else {
            nextChildren.push(...splitTextWithSegments(child.value));
          }
          continue;
        }

        if (child.type === "element") {
          const tagName = child.tagName?.toLowerCase();
          const nextInsideCode = insideCode || tagName === "code" || tagName === "pre";
          transform(child, nextInsideCode);
          nextChildren.push(child);
          continue;
        }

        if (child.children && child.children.length) {
          transform(child, insideCode);
        }
        nextChildren.push(child);
      }

      node.children = nextChildren;
    };

    transform(tree, false);
  };
}

const API_ENDPOINT =
  process.env.NEXT_PUBLIC_CHATBASE_PROXY_API_ENDPOINT ??
  process.env.NEXT_PUBLIC_API_ENDPOINT ??
  "https://vwiy6y0d3b.execute-api.ap-southeast-1.amazonaws.com/Prod/chat";

const TRAIN_LLM_TOKEN_COST = 50_000;
const TRAIN_LLM_KB_EXPERT_COMMAND = "update-kb-expert-knowledgE";
const KB_EXPERT_PREFIX = "kbexpert:";
const KB_EXPERT_AGENT = "kb-expert";
const KB_ANALYZER_AGENT = "kb-analyzer";

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

const BOT_MARKDOWN_COMPONENTS: MarkdownComponents = {
  p({ children }) {
    return <p className="mb-2 last:mb-0">{children}</p>;
  },
  ul({ children }) {
    return <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>;
  },
  li({ children }) {
    return <li className="mb-1 last:mb-0">{children}</li>;
  },
  a({ href, children }) {
    if (!href) {
      return <span className="underline">{children}</span>;
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline decoration-primary/40 underline-offset-2 hover:opacity-90"
      >
        {children}
      </a>
    );
  },
  code({ children, className }) {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="rounded bg-gray-2 px-1 py-0.5 font-mono text-[12px] text-dark dark:bg-dark-3 dark:text-white">
          {children}
        </code>
      );
    }
    return (
      <code className="block whitespace-pre font-mono text-[12px] text-dark dark:text-white">
        {children}
      </code>
    );
  },
  pre({ children }) {
    return (
      <pre className="custom-scrollbar mb-2 overflow-x-auto rounded-lg bg-gray-2 p-3 dark:bg-dark-3">
        {children}
      </pre>
    );
  },
};

function joinUrl(base: string, path: string) {
  const safeBase = (base ?? "").trim().replace(/\/+$/, "");
  const safePath = (path ?? "").trim().replace(/^\/+/, "");
  if (!safeBase) return `/${safePath}`;
  if (!safePath) return safeBase;
  return `${safeBase}/${safePath}`;
}

function appendQueryParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function getAssistantIdForUser(sub?: string) {
  const pairs: Array<[string | undefined, string | undefined]> = [
    [process.env.NEXT_PUBLIC_COGID_OTAVIO, process.env.NEXT_PUBLIC_ASSID_OTAVIO],
    [process.env.NEXT_PUBLIC_COGID_MARTINA, process.env.NEXT_PUBLIC_ASSID_MARTINA],
    [process.env.NEXT_PUBLIC_COGID_CLAUDIA, process.env.NEXT_PUBLIC_ASSID_CLAUDIA],
    [process.env.NEXT_PUBLIC_COGID_INFO, process.env.NEXT_PUBLIC_ASSID_INFO],
  ];

  const map = Object.fromEntries(pairs.filter(([key, value]) => key && value) as Array<[string, string]>);
  return sub ? map[sub] : undefined;
}

function parseSchemaInput(schema: unknown) {
  if (!schema) return null;
  if (typeof schema === "string") {
    const trimmed = schema.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (typeof schema === "object") {
    return schema;
  }
  return null;
}

function buildRequestFromSchema(
  schema: unknown,
  message: string,
  userIdentifier: string,
): Record<string, unknown> {
  const parsed = parseSchemaInput(schema);
  let placedMessage = false;
  let placedUser = false;

  const fillTemplate = (template: any): any => {
    if (Array.isArray(template)) {
      return template.map((item) => fillTemplate(item));
    }
    if (!template || typeof template !== "object") {
      return template;
    }
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template)) {
      const lower = key.toLowerCase();
      if (typeof value === "string") {
        if (lower.includes("prompt") || lower.includes("message") || lower.includes("query") || lower.includes("input")) {
          placedMessage = true;
          copy[key] = message;
          continue;
        }
        if (lower.includes("user")) {
          placedUser = true;
          copy[key] = userIdentifier;
          continue;
        }
      }
      copy[key] = fillTemplate(value);
    }
    return copy;
  };

  const payload =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? fillTemplate(parsed) : {};

  if (!placedMessage) {
    (payload as Record<string, unknown>).message = message;
  }
  if (!placedUser) {
    (payload as Record<string, unknown>).userId = userIdentifier;
  }

  return payload;
}

function safeParseJsonFromText(raw: string) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  const codeFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (codeFence ? codeFence[1] : trimmed).trim();
  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function mergeAdjacentSegments(segments: SourceSegment[]) {
  const merged: SourceSegment[] = [];

  for (const segment of segments) {
    if (!segment.text) continue;
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.source_id === segment.source_id &&
      (previous.source_title ?? null) === (segment.source_title ?? null)
    ) {
      previous.text += segment.text;
      continue;
    }

    merged.push({ ...segment });
  }

  return merged;
}

function normalizeKbAnalyzerSegments(fullText: string, payload: KbAnalyzerResponsePayload): SourceSegment[] {
  const rawSegments = Array.isArray(payload?.segments) ? payload.segments : [];
  const normalized = rawSegments
    .filter((segment) => segment && typeof segment === "object")
    .map((segment) => {
      const segmentText = typeof segment.segment_text === "string" ? segment.segment_text : "";
      const sourceId =
        segment.source_id === null || typeof segment.source_id === "string" ? segment.source_id : null;
      const sourceTitle = typeof segment.source_title === "string" ? segment.source_title : null;

      return {
        text: segmentText,
        source_id: sourceId && sourceId.trim() ? sourceId.trim() : null,
        source_title: sourceTitle && sourceTitle.trim() ? sourceTitle.trim() : null,
      } satisfies SourceSegment;
    })
    .filter((segment) => segment.text.length > 0);

  if (!normalized.length || !fullText) {
    return normalized;
  }

  const stitched: SourceSegment[] = [];
  let cursor = 0;

  for (const segment of normalized) {
    const matchIndex = fullText.indexOf(segment.text, cursor);
    if (matchIndex === -1) {
      continue;
    }

    if (matchIndex > cursor) {
      stitched.push({ text: fullText.slice(cursor, matchIndex), source_id: null, source_title: null });
    }

    stitched.push(segment);
    cursor = matchIndex + segment.text.length;
  }

  if (cursor < fullText.length) {
    stitched.push({ text: fullText.slice(cursor), source_id: null, source_title: null });
  }

  return mergeAdjacentSegments(stitched).filter((segment) => segment.text.length > 0);
}

function findFirstStringForKeys(body: unknown, keys: string[]): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const queue: Array<unknown> = [body];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      if (typeof value === "string" && keys.includes(key.toLowerCase())) {
        return value;
      }
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }
  return undefined;
}

function extractResponseText(body: unknown, schema: unknown): string | undefined {
  if (typeof body === "string") return body;
  if (body && typeof body === "object" && "text" in (body as Record<string, unknown>)) {
    const val = (body as Record<string, unknown>).text;
    if (typeof val === "string") return val;
  }
  const candidates = new Set(["answer", "response", "text", "message", "output", "content"]);
  const parsedSchema = parseSchemaInput(schema);
  if (parsedSchema && typeof parsedSchema === "object" && !Array.isArray(parsedSchema)) {
    const walk = (obj: Record<string, unknown>) => {
      for (const key of Object.keys(obj)) {
        candidates.add(key.toLowerCase());
        const val = obj[key];
        if (val && typeof val === "object" && !Array.isArray(val)) {
          walk(val as Record<string, unknown>);
        }
      }
    };
    walk(parsedSchema as Record<string, unknown>);
  }

  const orderedKeys = Array.from(candidates);
  const found = findFirstStringForKeys(body, orderedKeys);
  if (found) return found;

  const maybeChoice =
    (body as any)?.choices?.[0]?.message?.content ??
    (body as any)?.choices?.[0]?.text ??
    (body as any)?.data?.[0]?.text;
  if (typeof maybeChoice === "string") return maybeChoice;

  return undefined;
}

function extractSuggestions(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const collected: string[] = [];

  const pushValue = (val: unknown) => {
    if (typeof val === "string" && val.trim()) {
      collected.push(val.trim());
      return;
    }
    if (Array.isArray(val)) {
      val.forEach((item) => pushValue(item));
      return;
    }
    if (val && typeof val === "object") {
      const obj = val as Record<string, unknown>;
      if (typeof obj.text === "string" && obj.text.trim()) collected.push(obj.text.trim());
      if (typeof obj.message === "string" && obj.message.trim()) collected.push(obj.message.trim());
      if (typeof obj.suggestion === "string" && obj.suggestion.trim()) collected.push(obj.suggestion.trim());
    }
  };

  const queue: Array<unknown> = [body];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      if (key.toLowerCase() === "suggestions") {
        pushValue(value);
      } else if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  const unique = Array.from(new Set(collected.map((s) => s.trim()))).filter(Boolean);
  return unique;
}

function extractUsageMetadata(body: unknown) {
  if (!body || typeof body !== "object") return null;

  const candidate =
    (body as any).usageMetadata ??
    (body as any).usage_metadata ??
    (body as any).usage ??
    null;

  if (!candidate || typeof candidate !== "object") return null;

  const promptTokenCount = Number(
    (candidate as any).promptTokenCount ?? (candidate as any).prompt_token_count,
  );
  const candidatesTokenCount = Number(
    (candidate as any).candidatesTokenCount ?? (candidate as any).candidates_token_count,
  );
  const totalTokenCount = Number(
    (candidate as any).totalTokenCount ?? (candidate as any).total_token_count,
  );

  const usageMetadata = {
    ...(Number.isFinite(promptTokenCount) ? { promptTokenCount } : {}),
    ...(Number.isFinite(candidatesTokenCount) ? { candidatesTokenCount } : {}),
    ...(Number.isFinite(totalTokenCount) ? { totalTokenCount } : {}),
  };

  return Object.keys(usageMetadata).length ? usageMetadata : null;
}

function formatTokenCount(value: number) {
  try {
    return value.toLocaleString();
  } catch {
    return String(value);
  }
}

async function resolveUserIdentifier() {
  try {
    const session = await fetchAuthSession();
    const sub = session?.tokens?.idToken?.payload?.sub;
    if (typeof sub === "string" && sub.length > 0) {
      return sub;
    }
  } catch {
    // ignore
  }

  try {
    const user = await getCurrentUser();
    if (user?.userId) return user.userId;
    if ((user as any)?.username) return (user as any).username as string;
  } catch {
    // ignore
  }

  return undefined;
}

type ChatInterfaceProps = {
  fullHeight?: boolean;
  cardOnly?: boolean;
  enableAttribution?: boolean;
  showTrainButton?: boolean;
  headerTitle?: string;
  headerSubtitle?: string;
  variant?: "card" | "bleed";
  initialMessages?: ChatSeedMessage[];
  showAuthCta?: boolean;
};

export function ChatInterface({
  fullHeight = false,
  cardOnly = false,
  enableAttribution = false,
  showTrainButton = false,
  headerTitle,
  headerSubtitle,
  variant = "card",
  initialMessages,
  showAuthCta = false,
}: ChatInterfaceProps) {
  const searchParams = useSearchParams();
  const { tokens, isAuthenticated, isLoading: authLoading } = useUser();
  const sessionId = searchParams?.get("session_id");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (initialMessages?.length) {
      return initialMessages.map((message) => ({
        id: createId(),
        text: message.text,
        sender: message.sender ?? "bot",
        ...(message.suggestions ? { suggestions: message.suggestions } : {}),
      }));
    }

    return [{ id: "initial", text: "Hi! How can I help you today?", sender: "bot" }];
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [cogUserId, setCogUserId] = useState("");
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [sessionConfigLoading, setSessionConfigLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trainConfirmMode, setTrainConfirmMode] = useState<"train_llm" | "train_kb_expert" | null>(null);
  const [trainSending, setTrainSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const heightClassName = fullHeight ? "inbox-height" : "chat-height";
  const showAuthActions = showAuthCta && !isAuthenticated && !authLoading;
  const sessionLinkHref = sessionId ? `/session?id=${encodeURIComponent(sessionId)}` : null;
  const kbEndpoint = useMemo(
    () => String(sessionConfig?.agent_kb_endpoint ?? "").trim(),
    [sessionConfig],
  );
  const authHeader = useMemo(
    () => buildBearerTokenFromTokens(tokens),
    [tokens?.accessToken, tokens?.idToken],
  );
  const walletUserId = useMemo(() => {
    const resolved = sessionUserId ?? (cogUserId.trim() ? cogUserId.trim() : null) ?? userId;
    return typeof resolved === "string" && resolved.trim() ? resolved.trim() : null;
  }, [cogUserId, sessionUserId, userId]);
  const trainCommand = useMemo(
    () => String(sessionConfig?.train_chatbot_command ?? "").trim(),
    [sessionConfig],
  );
  const kbKeyName = useMemo(() => {
    const resolved = String(sessionConfig?.agent_kb_key_name ?? "x-api-key").trim();
    return resolved || "x-api-key";
  }, [sessionConfig]);
  const kbKeyValue = useMemo(() => String(sessionConfig?.agent_kb_key ?? "").trim(), [sessionConfig]);
  const sourceArticleEndpoint = useMemo(
    () => (kbEndpoint ? joinUrl(kbEndpoint, "/source-article") : ""),
    [kbEndpoint],
  );
  const [sourceModal, setSourceModal] = useState<SourceModalState | null>(null);
  const [sourceTitle, setSourceTitle] = useState<string>("");
  const [sourceBody, setSourceBody] = useState<string>("");
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceSaving, setSourceSaving] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const userMessages = useMemo(
    () => messages.filter((msg) => msg.sender === "user").map((msg) => msg.text),
    [messages],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    let currentUserId = window.localStorage.getItem("pluree_user_id");
    if (!currentUserId) {
      currentUserId = createId();
      window.localStorage.setItem("pluree_user_id", currentUserId);
    }
    setUserId(currentUserId);
  }, []);

  useEffect(() => {
    const resolveUser = async () => {
      try {
        const session = await fetchAuthSession();
        const sub = session?.tokens?.idToken?.payload?.sub;
        if (sub) {
          setCogUserId(sub);
          setSessionUserId((prev) => prev ?? sub);
          return;
        }
      } catch {
        // ignore
      }

      try {
        const user = await getCurrentUser();
        if (user?.userId) {
          setCogUserId(user.userId);
          setSessionUserId((prev) => prev ?? user.userId);
        }
      } catch {
        // Not signed in or unable to resolve; leave empty
      }
    };

    resolveUser();
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setSessionConfig(null);
      setSessionConfigLoading(false);
      return;
    }
    let active = true;
    const loadConfig = async () => {
      setSessionConfigLoading(true);
      try {
        const userIdentifier = sessionUserId ?? (await resolveUserIdentifier());
        if (!userIdentifier) {
          setError("Unable to resolve user identity for agent chat.");
          return;
        }
        setSessionUserId((prev) => prev ?? userIdentifier);
        const { session } = await fetchSessionDetail(sessionId, userIdentifier);
        if (!active) return;
        if (!session?.config || !session.config.chat_api_endpoint) {
          setSessionConfig(null);
          setError("Agent chat configuration is missing required settings.");
          return;
        }
        setSessionConfig(session.config);
      } catch (err) {
        if (!active) return;
        console.error("[ChatInterface] Unable to load session config", err);
        setSessionConfig(null);
        setError("Unable to load agent configuration for chat.");
      } finally {
        if (active) {
          setSessionConfigLoading(false);
        }
      }
    };
    loadConfig();
    return () => {
      active = false;
    };
  }, [sessionId, sessionUserId]);

  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].sender === "bot") {
      inputRef.current?.focus();
    }
  }, [messages]);

  useEffect(() => {
    const onStart = () => setIsTraining(true);
    const onEnd = () => setIsTraining(false);
    const onStatus = (event: Event) => {
      const detail = (event as StatusEvent).detail;
      const text = detail?.message;
      if (!text) return;
      setMessages((prev) => [...prev, { id: createId(), text: `Training status: ${text}`, sender: "bot" }]);
    };

    window.addEventListener("ai-training-start", onStart);
    window.addEventListener("ai-training-end", onEnd);
    window.addEventListener("ai-training-status", onStatus as EventListener);

    return () => {
      window.removeEventListener("ai-training-start", onStart);
      window.removeEventListener("ai-training-end", onEnd);
      window.removeEventListener("ai-training-status", onStatus as EventListener);
    };
  }, []);

  const analyzeBotResponseSources = useCallback(
    async (options: {
      responseText: string;
      signal: AbortSignal;
      asyncJobId?: string;
      onJobUpdate?: (job: AsyncJobResponse) => void;
    }) => {
      if (!sessionConfig?.chat_api_endpoint) {
        throw new Error("Agent chat configuration is missing required settings.");
      }

      const responseText = String(options.responseText ?? "");
      const endpoint = String(sessionConfig.chat_api_endpoint).trim();
      if (!endpoint) {
        throw new Error("Chat API endpoint is missing for this agent.");
      }

      const resolvedUserId =
        sessionUserId || cogUserId || userId || (await resolveUserIdentifier()) || createId();
      if (!sessionUserId && resolvedUserId) {
        setSessionUserId(resolvedUserId);
      }

      const headerName = (sessionConfig?.chat_api_key_name || "x-api-key").trim() || "x-api-key";
      const headerValue = sessionConfig?.chat_api_key ? String(sessionConfig.chat_api_key).trim() : "";
      const headers: Record<string, string> = {
        accept: "application/json",
        "Content-Type": "application/json",
      };
      if (headerName && headerValue) {
        headers[headerName] = headerValue;
      }
      if (authHeader) {
        headers.Authorization = authHeader;
      }

      const requestPayload = buildRequestFromSchema(
        sessionConfig?.chat_api_request_schema,
        responseText,
        resolvedUserId,
      );
      (requestPayload as Record<string, unknown>).llm = "gemini";
      (requestPayload as Record<string, unknown>).agent = KB_ANALYZER_AGENT;
      (requestPayload as Record<string, unknown>).async_job_id = options.asyncJobId || createId();
      (requestPayload as Record<string, unknown>).user_id = resolvedUserId;
      if (!("userId" in requestPayload)) {
        (requestPayload as Record<string, unknown>).userId = resolvedUserId;
      }
      if (!("message" in requestPayload)) {
        (requestPayload as Record<string, unknown>).message = responseText;
      }

      const started = await startChat({
        endpoint,
        headers,
        body: requestPayload,
        signal: options.signal,
      });

      let finalPayload: ChatSyncResponse;
      if (isAsyncJobResponse(started)) {
        const completed = await pollChatJob({
          chatEndpoint: endpoint,
          initial: started,
          headers,
          signal: options.signal,
          onUpdate: options.onJobUpdate,
        });

        if (!completed.result || typeof completed.result !== "object") {
          throw new Error("Async analyzer job completed without a result payload.");
        }
        finalPayload = completed.result as ChatSyncResponse;
      } else {
        finalPayload = started as ChatSyncResponse;
      }

      const usageMetadata = extractUsageMetadata(finalPayload);
      const rawText =
        finalPayload && typeof finalPayload === "object" && typeof (finalPayload as any).text === "string"
          ? String((finalPayload as any).text)
          : "";

      const parsed = safeParseJsonFromText(rawText);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("KB analyzer did not return valid JSON.");
      }

      const segments = normalizeKbAnalyzerSegments(responseText, parsed as KbAnalyzerResponsePayload);
      if (!segments.length) {
        throw new Error("KB analyzer returned no segments to attribute.");
      }

      return { segments, usageMetadata };
    },
    [authHeader, cogUserId, sessionConfig, sessionUserId, userId],
  );

  const handleSendMessage = async (
    text: string,
    options?: { skipWalletUsage?: boolean },
  ): Promise<string | null> => {
    if (!text.trim() || isLoading) return null;
    if (sessionId && !sessionConfig && !sessionConfigLoading) {
      setError("Agent chat configuration is not available yet.");
      return null;
    }

    const cleanText = text.trim();
    const isKbExpertRequest = cleanText.toLowerCase().startsWith(KB_EXPERT_PREFIX);
    const strippedKbExpertMessage = isKbExpertRequest
      ? cleanText.slice(KB_EXPERT_PREFIX.length).trimStart()
      : "";
    const payloadText =
      isKbExpertRequest && strippedKbExpertMessage ? strippedKbExpertMessage : cleanText;
    const userMessage: ChatMessage = { id: createId(), text: cleanText, sender: "user" };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const resolvedUserId =
        sessionUserId || cogUserId || userId || (await resolveUserIdentifier()) || createId();
      if (!sessionUserId && resolvedUserId) {
        setSessionUserId(resolvedUserId);
      }

      const useSessionEndpoint = Boolean(sessionId && sessionConfig?.chat_api_endpoint);
      let response: Response;
      let responseBody: any = null;

      if (useSessionEndpoint) {
        const endpoint = String(sessionConfig?.chat_api_endpoint || "").trim();
        if (!endpoint) {
          throw new Error("Chat API endpoint is missing for this agent.");
        }
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const headerName = (sessionConfig?.chat_api_key_name || "x-api-key").trim();
        const headerValue = sessionConfig?.chat_api_key ? String(sessionConfig.chat_api_key).trim() : "";
        if (headerName && headerValue) {
          headers[headerName] = headerValue;
        }
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        const requestPayload = buildRequestFromSchema(
          sessionConfig?.chat_api_request_schema,
          payloadText,
          resolvedUserId,
        );
        if (isKbExpertRequest) {
          (requestPayload as Record<string, unknown>).agent = KB_EXPERT_AGENT;
        }

        response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(requestPayload),
        });

        try {
          responseBody = await response.json();
        } catch {
          responseBody = null;
        }
      } else {
        let assistantId = getAssistantIdForUser(cogUserId);
        let keyVal = cogUserId || "";

        if (!assistantId || !keyVal) {
          try {
            const session = await fetchAuthSession();
            const sub = session?.tokens?.idToken?.payload?.sub;
            if (sub) {
              setCogUserId(sub);
              if (!assistantId) assistantId = getAssistantIdForUser(sub);
              if (!keyVal) keyVal = sub;
            }
          } catch {
            // ignore
          }

          if (!assistantId || !keyVal) {
            try {
              const user = await getCurrentUser();
              if (user?.userId) {
                setCogUserId(user.userId);
                if (!assistantId) assistantId = getAssistantIdForUser(user.userId);
                if (!keyVal) keyVal = user.userId;
              }
            } catch {
              // ignore, proceed with available identifiers
            }
          }
        }

        const userIdentifier = keyVal || userId || createId();
        const payload: Record<string, unknown> = {
          userId: userIdentifier,
          message: payloadText,
          llm: "gemini",
          llm_model: "gemini-3-flash-preview",
        };
        if (isKbExpertRequest) payload.agent = KB_EXPERT_AGENT;

        if (assistantId) payload.assistant_id = assistantId;
        if (keyVal) payload.key = keyVal;

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        response = await fetch(API_ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        try {
          responseBody = await response.json();
        } catch {
          responseBody = null;
        }
      }

      if (!response.ok) {
        const message =
          responseBody?.message || responseBody?.error || "Sorry, an unexpected error occurred.";
        throw new Error(message);
      }

      const resolvedWalletUserId = sessionUserId || cogUserId || resolvedUserId;

      const usageMetadata = extractUsageMetadata(responseBody);
      if (!options?.skipWalletUsage && usageMetadata?.totalTokenCount) {
        void recordUserWalletUsage(resolvedWalletUserId, usageMetadata).catch((err) => {
          console.warn("[ChatInterface] Unable to record wallet usage", err);
        });
      }

      const botText = useSessionEndpoint
        ? extractResponseText(responseBody, sessionConfig?.chat_api_response_schema) ??
          "The assistant did not return a response."
        : typeof responseBody?.text === "string" && responseBody.text.length
          ? responseBody.text
          : "The assistant did not return a response.";
      const suggestions = extractSuggestions(responseBody);
      const botMessage: ChatMessage = {
        id: createId(),
        text: botText,
        sender: "bot",
        ...(suggestions.length ? { suggestions } : {}),
        ...(usageMetadata ? { usageMetadata } : {}),
      };
      setMessages((prev) => [...prev, botMessage]);
      return resolvedWalletUserId;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sorry, an unexpected error occurred.";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const suggestionsDisabled = isLoading || isTraining || (Boolean(sessionId) && sessionConfigLoading);
  const baseTrainDisabled =
    !showTrainButton || !sessionId || !sessionConfig || suggestionsDisabled || trainSending;
  const trainDisabled = baseTrainDisabled || !trainCommand;
  const trainKbExpertDisabled = baseTrainDisabled;

  const handleSuggestionSelect = (suggestion: string) => {
    if (!suggestion.trim()) return;
    if (suggestionsDisabled) return;
    void handleSendMessage(suggestion);
  };

  const handleTrainConfirm = async () => {
    const mode = trainConfirmMode;
    if (!mode) return;

    const command = mode === "train_kb_expert" ? TRAIN_LLM_KB_EXPERT_COMMAND : trainCommand.trim();
    if (mode === "train_llm" && !command) {
      setError("Train Agent Command is not configured for this agent.");
      setTrainConfirmMode(null);
      return;
    }
    setTrainSending(true);
    setTrainConfirmMode(null);
    try {
      const resolvedWalletUserId = await handleSendMessage(command, { skipWalletUsage: true });
      if (resolvedWalletUserId) {
        void recordUserWalletUsage(resolvedWalletUserId, {
          totalTokenCount: TRAIN_LLM_TOKEN_COST,
        }).catch((err) => {
          console.warn("[ChatInterface] Unable to record wallet usage for training", err);
        });
      }
    } finally {
      setTrainSending(false);
    }
  };

  const handleOpenSource = useCallback(
    (request:
      | { mode: "edit"; sourceId: string; sourceTitle?: string | null }
      | { mode: "create"; seedText: string }) => {
      if (request.mode === "edit") {
        const cleanId = String(request.sourceId ?? "").trim();
        if (!cleanId) return;
        const resolvedTitle = request.sourceTitle ? String(request.sourceTitle) : "";
        setSourceModal({ mode: "edit", sourceId: cleanId, sourceTitle: request.sourceTitle ?? null });
        setSourceTitle(resolvedTitle);
        setSourceBody("");
        setSourceError(null);
        return;
      }

      const seedText = String(request.seedText ?? "").trimEnd();
      setSourceModal({ mode: "create", sourceId: null, sourceTitle: null, seedText });
      setSourceTitle("");
      setSourceBody(seedText);
      setSourceError(null);
      setSourceLoading(false);
    },
    [],
  );

  const handleCloseSource = useCallback(() => {
    setSourceModal(null);
    setSourceError(null);
  }, []);

  const activeSourceId = sourceModal?.mode === "edit" ? sourceModal.sourceId : null;

  useEffect(() => {
    if (!activeSourceId) return;
    if (!enableAttribution) return;

    const sourceId = activeSourceId;

    if (!sourceArticleEndpoint) {
      setSourceError("Knowledge Base endpoint is not configured for this agent.");
      return;
    }

    let active = true;
    const controller = new AbortController();

    async function loadSourceArticle() {
      setSourceLoading(true);
      setSourceError(null);
      try {
        const headers: Record<string, string> = { accept: "application/json" };
        if (kbKeyValue) {
          headers[kbKeyName] = kbKeyValue;
        }
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        const url = appendQueryParam(sourceArticleEndpoint, "id", sourceId);
        const res = await fetch(url, { method: "GET", headers, cache: "no-store", signal: controller.signal });
        const payload = await res.json().catch(() => null as any);

        if (!res.ok) {
          const message =
            (payload && typeof payload === "object" && (payload.message || payload.error)) ||
            `Failed to load source article (status ${res.status})`;
          throw new Error(String(message));
        }

        const candidate = payload && typeof payload === "object" ? payload : {};
        const articleObj =
          candidate && typeof candidate === "object" && (candidate as any).article && typeof (candidate as any).article === "object"
            ? (candidate as any).article
            : candidate;
        const resolvedTitle =
          typeof (articleObj as any).source_title === "string"
            ? (articleObj as any).source_title
            : typeof (articleObj as any).title === "string"
              ? (articleObj as any).title
              : null;
        const resolvedBody =
          typeof (articleObj as any).body === "string"
            ? (articleObj as any).body
            : typeof (articleObj as any).article_body === "string"
              ? (articleObj as any).article_body
              : typeof (articleObj as any).content === "string"
                ? (articleObj as any).content
                : typeof (articleObj as any).text === "string"
                  ? (articleObj as any).text
                  : payload && typeof payload === "string"
                    ? payload
                    : JSON.stringify(articleObj ?? candidate, null, 2);

        if (!active) return;
        setSourceBody(resolvedBody ?? "");
        if (resolvedTitle) {
          setSourceModal((prev) =>
            prev && prev.sourceId === sourceId ? { ...prev, sourceTitle: resolvedTitle } : prev,
          );
          setSourceTitle(resolvedTitle);
        }
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        console.error("[ChatInterface] Unable to load source article", err);
        const message = err instanceof Error ? err.message : "Unable to load source article right now.";
        setSourceError(message);
      } finally {
        if (active) {
          setSourceLoading(false);
        }
      }
    }

    void loadSourceArticle();
    return () => {
      active = false;
      controller.abort();
    };
  }, [activeSourceId, authHeader, enableAttribution, kbKeyName, kbKeyValue, sourceArticleEndpoint]);

  const handleSaveSource = useCallback(async () => {
    if (!sourceArticleEndpoint) {
      setSourceError("Knowledge Base endpoint is not configured for this agent.");
      return;
    }
    if (!sourceModal) return;
    setSourceSaving(true);
    setSourceError(null);
    try {
      const headers: Record<string, string> = {
        accept: "application/json",
        "Content-Type": "application/json",
      };
      if (kbKeyValue) {
        headers[kbKeyName] = kbKeyValue;
      }
      if (authHeader) {
        headers.Authorization = authHeader;
      }

      const res = await fetch(sourceArticleEndpoint, {
        method: sourceModal.mode === "edit" ? "PUT" : "POST",
        headers,
        body: JSON.stringify(
          sourceModal.mode === "edit"
            ? { id: sourceModal.sourceId, title: sourceTitle, content: sourceBody }
            : { title: sourceTitle, content: sourceBody },
        ),
      });
      const payload = await res.json().catch(() => null as any);
      if (!res.ok) {
        const message =
          (payload && typeof payload === "object" && (payload.message || payload.error)) ||
          `Failed to save source article (status ${res.status})`;
        throw new Error(String(message));
      }
      setSourceModal(null);
    } catch (err) {
      console.error("[ChatInterface] Save source article failed", err);
      const message = err instanceof Error ? err.message : "Unable to save source article right now.";
      setSourceError(message);
    } finally {
      setSourceSaving(false);
    }
  }, [authHeader, kbKeyName, kbKeyValue, sourceArticleEndpoint, sourceBody, sourceModal, sourceTitle]);

  const cardShellClassName =
    variant === "bleed"
      ? "border-0 bg-white dark:bg-gray-dark"
      : "rounded-[10px] border border-stroke bg-white shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card";
  const cardBodyClassName =
    variant === "bleed"
      ? "flex flex-col overflow-hidden bg-gray-1 dark:bg-dark-2"
      : "flex flex-col overflow-hidden rounded-b-[10px] bg-gray-1 dark:bg-dark-2";
  const titleText = headerTitle ?? "Review responses and edit sources inline.";
  const subtitleText = headerSubtitle ?? "";

  const chatCard = (
    <div className={cardShellClassName}>
      <div className="flex flex-col gap-3 border-b border-stroke px-5 py-4 dark:border-dark-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-dark dark:text-white">
            {titleText}
          </p>
          {subtitleText ? (
            <p className="text-sm text-dark-5 dark:text-dark-6">{subtitleText}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {sessionLinkHref ? (
            <Link
              href={sessionLinkHref}
              className="inline-flex items-center rounded-full border border-stroke px-3 py-1 text-xs font-semibold text-dark transition hover:bg-gray-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
            >
              View agent
              </Link>
          ) : null}
          {showTrainButton ? (
            <>
              <button
                type="button"
                className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setTrainConfirmMode("train_llm")}
                disabled={trainDisabled}
                title={
                  !sessionId
                    ? "Open this page with an agent ID to train."
                    : !sessionConfig
                      ? "Agent configuration is not loaded yet."
                      : !trainCommand
                        ? "Configure Train Agent Command in the agent settings."
                        : suggestionsDisabled
                          ? "Chat is busy right now."
                          : undefined
                }
              >
                {trainSending ? "Training..." : "Train LLM"}
              </button>
              <button
                type="button"
                className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-primary shadow-sm transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-primary/30 dark:bg-primary/15 dark:hover:bg-primary/20"
                onClick={() => setTrainConfirmMode("train_kb_expert")}
                disabled={trainKbExpertDisabled}
                title={
                  !sessionId
                    ? "Open this page with an agent ID to train."
                    : !sessionConfig
                      ? "Agent configuration is not loaded yet."
                      : suggestionsDisabled
                        ? "Chat is busy right now."
                        : undefined
                }
              >
                {trainSending ? "Training..." : "Train LLM KB Expert"}
              </button>
            </>
          ) : null}
          {showAuthActions ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-dark-5 dark:text-dark-6">
                Already a member?
              </span>
              <Link
                href="/auth/sign-in"
                className="inline-flex items-center rounded-full border border-stroke px-3 py-1 text-xs font-semibold text-dark transition hover:bg-gray-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
              >
                Sign in
              </Link>
              <Link
                href="/auth/sign-up"
                className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-white shadow-sm transition hover:bg-opacity-90"
              >
                Create account
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      <div className={cardBodyClassName}>
        <div className={`${heightClassName} flex flex-col`}>
          <MessageList
            messages={messages}
            isLoading={isLoading}
            onSuggestionSelect={handleSuggestionSelect}
            disableSuggestions={suggestionsDisabled}
            enableAttribution={enableAttribution}
            analyzeSources={
              enableAttribution && sessionConfig?.chat_api_endpoint && kbEndpoint ? analyzeBotResponseSources : undefined
            }
            onOpenSource={enableAttribution ? handleOpenSource : undefined}
            walletUserId={walletUserId}
          />

          <div className="mt-auto flex flex-col gap-3 border-t border-stroke bg-gray-1 px-4 pb-3 pt-2 shadow-[0_-6px_18px_rgba(17,25,40,0.06)] dark:border-dark-3 dark:bg-dark-2 dark:shadow-[0_-8px_22px_rgba(0,0,0,0.22)]">
            {error && <ErrorDisplay message={error} />}

            <MessageInput
              disabled={suggestionsDisabled}
              inputRef={inputRef}
              onSendMessage={handleSendMessage}
              userMessages={userMessages}
            />

            <div className="flex items-center justify-center gap-2 pb-1 text-xs font-medium text-dark-5 dark:text-dark-6">
              <PlureeLogo />
              <span className="text-sm">
                Powered by{" "}
                <a
                  href="https://pluree.ai"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  pluree.ai
                </a>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const trainConfirmModal =
    showTrainButton && trainConfirmMode ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={() => setTrainConfirmMode(null)}
      >
        <div
          className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-dark"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <h4 className="text-lg font-semibold text-dark dark:text-white">
            {trainConfirmMode === "train_kb_expert" ? "Train LLM KB Expert" : "Train LLM"}
          </h4>
          <p className="mt-3 text-sm text-dark-5 dark:text-dark-6">
            {trainConfirmMode === "train_kb_expert"
              ? "Train LLM KB Expert will start a training run. We recommend making as many edits as possible before training to optimize costs. Are you sure you want to proceed?"
              : "We recommend making as many edits as possible before training to optimize costs. Are you sure you want to proceed?"}
          </p>
          {trainConfirmMode === "train_kb_expert" || trainCommand ? (
            <div className="mt-3 rounded-lg border border-stroke bg-gray-1 px-3 py-2 text-xs text-dark dark:border-dark-3 dark:bg-dark-2 dark:text-white">
              Command:{" "}
              <span className="font-mono">
                {trainConfirmMode === "train_kb_expert" ? TRAIN_LLM_KB_EXPERT_COMMAND : trainCommand}
              </span>
            </div>
          ) : null}
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:shadow-sm dark:border-dark-3 dark:text-white"
              onClick={() => setTrainConfirmMode(null)}
              disabled={trainSending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleTrainConfirm}
              disabled={trainConfirmMode === "train_kb_expert" ? trainKbExpertDisabled : trainDisabled}
            >
              {trainSending
                ? "Training..."
                : trainConfirmMode === "train_kb_expert"
                  ? "Yes, Train KB Expert"
                  : "Yes, Train"}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  if (cardOnly) {
    return (
      <>
        {chatCard}
        {trainConfirmModal}
        {sourceModal ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-dark/70 p-4"
            role="dialog"
            aria-modal="true"
            onClick={handleCloseSource}
          >
            <div
              className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl dark:bg-dark-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-dark dark:text-white">
                    {sourceModal.mode === "create" ? "Add Knowledge Base Source" : "Edit Knowledge Base Source"}
                  </div>
                  <div className="mt-1 text-xs text-dark-5 dark:text-dark-6">
                    {sourceModal.mode === "edit" ? (
                      <span className="font-mono">{sourceModal.sourceId}</span>
                    ) : (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        New article
                      </span>
                    )}
                    {sourceTitle && sourceModal.mode === "edit" ? (
                      <span className="ml-2 rounded-full bg-gray-2 px-2 py-0.5 text-xs font-semibold text-dark dark:bg-dark-3 dark:text-white">
                        {sourceTitle}
                      </span>
                    ) : null}
                  </div>
                  {sourceModal.mode === "create" && sourceModal.seedText ? (
                    <div className="mt-2 rounded-lg border border-stroke bg-gray-1 px-3 py-2 text-xs text-dark dark:border-dark-3 dark:bg-dark-3 dark:text-dark-6">
                      Segment: <span className="font-mono">{sourceModal.seedText.slice(0, 160)}</span>
                      {sourceModal.seedText.length > 160 ? "…" : ""}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleCloseSource}
                  className="rounded-lg border border-stroke px-3 py-1 text-xs font-semibold text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                >
                  Close
                </button>
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                  Title
                </label>
                <input
                  value={sourceTitle}
                  onChange={(e) => setSourceTitle(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder={sourceLoading ? "Loading..." : "Article title"}
                  disabled={sourceLoading || sourceSaving}
                />
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                  Content
                </label>
                <textarea
                  value={sourceBody}
                  onChange={(e) => setSourceBody(e.target.value)}
                  className="custom-scrollbar h-80 w-full resize-none rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder={
                    sourceLoading
                      ? "Loading..."
                      : sourceModal.mode === "create"
                        ? "Paste or write the new source article content here."
                        : "No content returned for this source."
                  }
                  disabled={sourceLoading || sourceSaving}
                />
              </div>

              {sourceError ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-light-5 px-3 py-2 text-sm text-red shadow-sm">
                  {sourceError}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseSource}
                  className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                  disabled={sourceSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSource}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={sourceLoading || sourceSaving}
                >
                  {sourceSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {chatCard}
      {trainConfirmModal}
      {sourceModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseSource}
        >
          <div
            className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl dark:bg-dark-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-dark dark:text-white">
                  {sourceModal.mode === "create" ? "Add Knowledge Base Source" : "Edit Knowledge Base Source"}
                </div>
                <div className="mt-1 text-xs text-dark-5 dark:text-dark-6">
                  {sourceModal.mode === "edit" ? (
                    <span className="font-mono">{sourceModal.sourceId}</span>
                  ) : (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      New article
                    </span>
                  )}
                  {sourceTitle && sourceModal.mode === "edit" ? (
                    <span className="ml-2 rounded-full bg-gray-2 px-2 py-0.5 text-xs font-semibold text-dark dark:bg-dark-3 dark:text-white">
                      {sourceTitle}
                    </span>
                  ) : null}
                </div>
                {sourceModal.mode === "create" && sourceModal.seedText ? (
                  <div className="mt-2 rounded-lg border border-stroke bg-gray-1 px-3 py-2 text-xs text-dark dark:border-dark-3 dark:bg-dark-3 dark:text-dark-6">
                    Segment: <span className="font-mono">{sourceModal.seedText.slice(0, 160)}</span>
                    {sourceModal.seedText.length > 160 ? "…" : ""}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleCloseSource}
                className="rounded-lg border border-stroke px-3 py-1 text-xs font-semibold text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                Title
              </label>
              <input
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
                className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                placeholder={sourceLoading ? "Loading..." : "Article title"}
                disabled={sourceLoading || sourceSaving}
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                Content
              </label>
              <textarea
                value={sourceBody}
                onChange={(e) => setSourceBody(e.target.value)}
                className="custom-scrollbar h-80 w-full resize-none rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                placeholder={
                  sourceLoading
                    ? "Loading..."
                    : sourceModal.mode === "create"
                      ? "Paste or write the new source article content here."
                      : "No content returned for this source."
                }
                disabled={sourceLoading || sourceSaving}
              />
            </div>

            {sourceError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-light-5 px-3 py-2 text-sm text-red shadow-sm">
                {sourceError}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseSource}
                className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                disabled={sourceSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSource}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={sourceLoading || sourceSaving}
              >
                {sourceSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type MessageProps = {
  sender: Sender;
  text: string;
  isLoading?: boolean;
  suggestions?: string[];
  onSuggestionSelect?: (suggestion: string) => void;
  disableSuggestions?: boolean;
  enableAttribution?: boolean;
  analyzeSources?: (options: {
    responseText: string;
    signal: AbortSignal;
    asyncJobId?: string;
    onJobUpdate?: (job: AsyncJobResponse) => void;
  }) => Promise<{ segments: SourceSegment[]; usageMetadata: UsageMetadata | null }>;
  onOpenSource?: (request: SourceOpenRequest) => void;
  walletUserId?: string | null;
  usageMetadata?: UsageMetadata | null;
};

function Message({
  sender,
  text,
  isLoading = false,
  suggestions,
  onSuggestionSelect,
  disableSuggestions = false,
  enableAttribution = false,
  analyzeSources,
  onOpenSource,
  walletUserId,
  usageMetadata,
}: MessageProps) {
  const isUser = sender === "user";
  const bubbleBase =
    "max-w-full rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm sm:max-w-3xl whitespace-pre-wrap break-words";
  const userStyles = "bg-primary text-dark font-semibold";
  const botStyles =
    "bg-white text-dark-5 ring-1 ring-stroke dark:bg-dark-2 dark:text-dark-6 dark:ring-dark-3";

  const [analysisSegments, setAnalysisSegments] = useState<SourceSegment[] | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const analysisJobRef = useRef<{ payloadKey: string; asyncJobId: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [isHovering, setIsHovering] = useState(false);

  const isAttributionEnabled = Boolean(enableAttribution && !isUser && !isLoading && analyzeSources && onOpenSource);
  const showSegmentedMarkdown = Boolean(isAttributionEnabled && analysisSegments && analysisSegments.length);
  const tokenUsageText = useMemo(() => {
    if (!usageMetadata || typeof usageMetadata !== "object") return null;
    const prompt = Number(usageMetadata.promptTokenCount);
    const candidates = Number(usageMetadata.candidatesTokenCount);
    const total = Number(usageMetadata.totalTokenCount);
    const parts: string[] = [];

    if (Number.isFinite(prompt)) parts.push(`prompt ${formatTokenCount(prompt)}`);
    if (Number.isFinite(candidates)) parts.push(`output ${formatTokenCount(candidates)}`);
    if (Number.isFinite(total)) parts.push(`total ${formatTokenCount(total)}`);

    return parts.length ? parts.join(" · ") : null;
  }, [usageMetadata]);

  const segmentedMarkdownComponents = useMemo<MarkdownComponents>(() => {
    return {
      ...BOT_MARKDOWN_COMPONENTS,
      span({ node: _node, children, ...props }) {
        const isAttributedSegment = Boolean(
          (props as Record<string, unknown>)["data-attrib-seg"] ??
            (props as Record<string, unknown>)["dataAttribSeg"],
        );
        const sourceId =
          (props as Record<string, unknown>)["data-source-id"] ??
          (props as Record<string, unknown>)["dataSourceId"] ??
          null;
        const sourceTitle =
          (props as Record<string, unknown>)["data-source-title"] ??
          (props as Record<string, unknown>)["dataSourceTitle"] ??
          null;

        const resolvedSourceId = typeof sourceId === "string" && sourceId.trim() ? sourceId.trim() : null;
        const resolvedSourceTitle = typeof sourceTitle === "string" && sourceTitle.trim() ? sourceTitle.trim() : null;
        const childrenArray = Children.toArray(children);
        const segmentText = childrenArray.map((child) => (typeof child === "string" ? child : "")).join("");

        const canEditExisting = Boolean(resolvedSourceId && onOpenSource);
        const canCreateNew = Boolean(
          isAttributedSegment && !resolvedSourceId && onOpenSource && segmentText.trim().length > 0,
        );
        const label = resolvedSourceTitle ?? resolvedSourceId ?? "";

        if (!canEditExisting && !canCreateNew) {
          return <span {...props}>{children}</span>;
        }

        const baseClassName = typeof props.className === "string" ? props.className : "";
        return (
          <span
            {...props}
            role="button"
            tabIndex={0}
            title={
              canEditExisting
                ? resolvedSourceTitle
                  ? `Source: ${resolvedSourceTitle}`
                  : undefined
                : "Add New Article"
            }
            className={`${baseClassName} relative inline cursor-pointer rounded-sm transition-colors hover:bg-yellow-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:bg-yellow-900/30`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (canEditExisting && resolvedSourceId) {
                onOpenSource?.({ mode: "edit", sourceId: resolvedSourceId, sourceTitle: resolvedSourceTitle });
                return;
              }
              if (canCreateNew) {
                onOpenSource?.({ mode: "create", seedText: segmentText });
              }
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              if (canEditExisting && resolvedSourceId) {
                onOpenSource?.({ mode: "edit", sourceId: resolvedSourceId, sourceTitle: resolvedSourceTitle });
                return;
              }
              if (canCreateNew) {
                onOpenSource?.({ mode: "create", seedText: segmentText });
              }
            }}
          >
            <span className="relative group">
              {children}
              <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-max max-w-[280px] rounded-md bg-dark px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-white dark:text-dark">
                {canEditExisting ? `Source: ${label}` : "Add New Article"}
              </span>
            </span>
          </span>
        );
      },
    };
  }, [onOpenSource]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const runAttributionAnalysis = useCallback(async () => {
    if (!isAttributionEnabled) return;
    if (analysisSegments) return;
    if (analysisStatus === "loading") return;
    if (!analyzeSources) return;

    setAnalysisStatus("loading");
    setAnalysisError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payloadKey = text;
      const reuseJob = analysisStatus !== "error" && analysisJobRef.current?.payloadKey === payloadKey;
      const asyncJobId = reuseJob ? analysisJobRef.current!.asyncJobId : createId();
      analysisJobRef.current = { payloadKey, asyncJobId };

      const { segments, usageMetadata } = await analyzeSources({
        responseText: text,
        signal: controller.signal,
        asyncJobId,
      });

      if (usageMetadata?.totalTokenCount) {
        const fallbackLocalId = (() => {
          if (typeof window === "undefined") return null;
          const existing = window.localStorage.getItem("pluree_user_id");
          if (existing) return existing;
          const created = createId();
          window.localStorage.setItem("pluree_user_id", created);
          return created;
        })();

        const resolvedWalletId =
          typeof walletUserId === "string" && walletUserId.trim() ? walletUserId.trim() : fallbackLocalId;

        if (resolvedWalletId) {
          void recordUserWalletUsage(resolvedWalletId, usageMetadata).catch((err) => {
            console.warn("[ChatInterface] Unable to record wallet usage for attribution", err);
          });
        }
      }

      setAnalysisSegments(segments);
      setAnalysisStatus("loaded");
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Unable to analyze sources right now.";
      setAnalysisError(message);
      setAnalysisStatus("error");
      analysisJobRef.current = null;
    }
  }, [
    analyzeSources,
    analysisSegments,
    analysisStatus,
    isAttributionEnabled,
    analysisJobRef,
    text,
    walletUserId,
  ]);

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`${bubbleBase} ${isUser ? userStyles : botStyles} ${isAttributionEnabled ? "relative" : ""}`}
          onMouseEnter={isAttributionEnabled ? () => setIsHovering(true) : undefined}
          onMouseLeave={isAttributionEnabled ? () => setIsHovering(false) : undefined}
        >
          {(() => {
            const canOfferEdit =
              isAttributionEnabled &&
              !showSegmentedMarkdown &&
              (analysisStatus === "idle" || analysisStatus === "error") &&
              Boolean(text.trim());
            const overlayVisible = canOfferEdit && isHovering;
            const loadingVisible = isAttributionEnabled && analysisStatus === "loading";
            const showOverlay = overlayVisible || loadingVisible;

            if (!showOverlay) return null;

            return (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-sm dark:bg-dark-2/60">
                {analysisStatus === "loading" ? (
                  <div className="flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs font-semibold text-dark shadow-sm dark:bg-dark-3/80 dark:text-white">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
                    Loading sources…
                  </div>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white shadow-sm transition hover:bg-opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    onClick={() => void runAttributionAnalysis()}
                  >
                    Edit
                  </button>
                )}
              </div>
            );
          })()}
          {isLoading ? (
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
            </div>
          ) : (
            <div
              className={
                isAttributionEnabled && !showSegmentedMarkdown && (isHovering || analysisStatus === "loading")
                  ? "blur-[2px] transition-[filter]"
                  : ""
              }
            >
              {isUser ? (
                text
              ) : showSegmentedMarkdown ? (
                <ReactMarkdown
                  components={segmentedMarkdownComponents}
                  rehypePlugins={[[rehypeAttributionSegments, { segments: analysisSegments ?? [] }]] as any}
                >
                  {text}
                </ReactMarkdown>
              ) : (
                <ReactMarkdown components={BOT_MARKDOWN_COMPONENTS}>{text}</ReactMarkdown>
              )}
              {!isUser && tokenUsageText ? (
                <div className="mt-2 text-[10px] font-semibold text-[rgb(169_240_15)]">
                  Tokens: {tokenUsageText}
                </div>
              ) : null}
            </div>
          )}
        </div>
        {!isUser && analysisStatus === "error" && analysisError ? (
          <div className="pl-1 text-xs text-red-600 dark:text-red-400">{analysisError}</div>
        ) : null}
        {!isUser && suggestions && suggestions.length ? (
          <div className="flex flex-col items-start gap-2 pl-1">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="w-full rounded-full border border-stroke px-3 py-1 text-left text-xs font-semibold text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3 sm:w-auto"
                onClick={() => onSuggestionSelect?.(suggestion)}
                disabled={disableSuggestions}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type MessageListProps = {
  messages: ChatMessage[];
  isLoading: boolean;
  onSuggestionSelect?: (suggestion: string) => void;
  disableSuggestions?: boolean;
  enableAttribution?: boolean;
  analyzeSources?: (options: {
    responseText: string;
    signal: AbortSignal;
    asyncJobId?: string;
    onJobUpdate?: (job: AsyncJobResponse) => void;
  }) => Promise<{ segments: SourceSegment[]; usageMetadata: UsageMetadata | null }>;
  onOpenSource?: (request: SourceOpenRequest) => void;
  walletUserId?: string | null;
};

function MessageList({
  messages,
  isLoading,
  onSuggestionSelect,
  disableSuggestions,
  enableAttribution = false,
  analyzeSources,
  onOpenSource,
  walletUserId,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  return (
    <div
      ref={scrollRef}
      className="custom-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-5"
    >
      {messages.map((msg) => (
        <Message
          key={msg.id}
          sender={msg.sender}
          text={msg.text}
          suggestions={msg.suggestions}
          onSuggestionSelect={onSuggestionSelect}
          disableSuggestions={disableSuggestions}
          enableAttribution={enableAttribution}
          analyzeSources={analyzeSources}
          onOpenSource={onOpenSource}
          walletUserId={walletUserId}
          usageMetadata={msg.usageMetadata}
        />
      ))}
      {isLoading && <Message sender="bot" text="..." isLoading />}
    </div>
  );
}

type MessageInputProps = {
  onSendMessage: (text: string) => void;
  disabled: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  userMessages: string[];
};

function MessageInput({ onSendMessage, disabled, inputRef, userMessages }: MessageInputProps) {
  const [text, setText] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    if (text !== "" && userMessages[userMessages.length - 1 - historyIndex] !== text) {
      setHistoryIndex(-1);
    }
  }, [historyIndex, text, userMessages]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (disabled || !text.trim()) return;
    onSendMessage(text);
    setText("");
    setHistoryIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    if (!userMessages.length) return;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      const newIndex = Math.min(historyIndex + 1, userMessages.length - 1);
      setHistoryIndex(newIndex);
      setText(userMessages[userMessages.length - 1 - newIndex]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const newIndex = Math.max(historyIndex - 1, -1);
      setHistoryIndex(newIndex);
      if (newIndex === -1) {
        setText("");
      } else {
        setText(userMessages[userMessages.length - 1 - newIndex]);
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-16 items-end rounded-xl border border-stroke bg-gray-1 px-3 py-2 shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:focus-within:border-primary"
    >
      <textarea
        ref={inputRef}
        className="custom-scrollbar flex w-full resize-none bg-transparent px-1 py-1 text-base font-medium text-dark placeholder:text-dark-6 focus-visible:outline-none disabled:cursor-not-allowed dark:text-white dark:placeholder:text-dark-6"
        placeholder="Message..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={disabled}
        maxLength={8000}
      />

      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="mb-1 ml-2 inline-flex size-11 items-center justify-center rounded-full bg-dark text-white shadow-[0_10px_30px_rgba(17,25,40,0.18)] transition hover:bg-dark-2 disabled:cursor-not-allowed disabled:bg-gray-4 disabled:text-gray-6 dark:bg-primary dark:text-dark"
        aria-label="Send message"
      >
        <SendIcon enabled={!disabled && Boolean(text.trim())} />
      </button>
    </form>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-light-5 px-3 py-2 text-sm text-red shadow-sm"
      role="alert"
    >
      <span className="mt-1 inline-block h-2 w-2 rounded-full bg-red" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
