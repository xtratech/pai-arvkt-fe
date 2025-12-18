function readEnv(name: string, fallback: string) {
  const value = process.env[name];
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : fallback;
}

const DATA_BUCKET = readEnv("NEXT_PUBLIC_DATA_BUCKET", "arvt-data-dev");
const SESSIONS_FOLDER = readEnv("NEXT_PUBLIC_S3_SESSIONS_FOLDER", "sessions");
const SYSTEM_PROMPTS_FOLDER = readEnv("NEXT_PUBLIC_S3_SYSTEMPROMPTS_FOLDER", "systemprompts");
const KBS_FOLDER = readEnv("NEXT_PUBLIC_S3_KBS_FOLDER", "kbs");
const FILES_FOLDER = readEnv("NEXT_PUBLIC_S3_FILES_FOLDER", "files");
const USER_PROMPTS_FOLDER = readEnv("NEXT_PUBLIC_S3_USERPROMPTS_FOLDER", "userprompts");
const SESSION_FILE_NAME = readEnv("NEXT_PUBLIC_SESSION_FILE_NAME", "session.json");
const SYSTEM_PROMPT_FILE_NAME = readEnv(
  "NEXT_PUBLIC_SYSTEMPROMPT_FILE_NAME",
  "systemprompt-v1.json",
);
const KB_FILE_NAME = readEnv("NEXT_PUBLIC_KB_FILE_NAME", "kb-v1.json");
const USER_PROMPT_FILE_NAME = readEnv("NEXT_PUBLIC_USERPROMPT_FILE_NAME", "userprompt-v1.txt");

const DEFAULT_SESSIONS_INDEX_TEMPLATE = `${SESSIONS_FOLDER}/:userId/sessions.json`;

function encodeSegment(value: string) {
  return encodeURIComponent(value.trim()).replace(/%2F/g, "-");
}

function joinSegments(...segments: Array<string | undefined>) {
  return segments.filter(Boolean).join("/");
}

function normalizeTemplate(path: string) {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function getDataBucketName() {
  return DATA_BUCKET;
}

export function buildSessionsIndexPath(userId: string) {
  const template = normalizeTemplate(
    readEnv("NEXT_PUBLIC_SESSIONS_PATH", DEFAULT_SESSIONS_INDEX_TEMPLATE),
  );
  const encodedUserId = encodeSegment(userId);

  if (template.includes(":userId")) {
    const resolved = template.replace(/:userId/g, encodedUserId);
    return normalizeTemplate(resolved) || `${SESSIONS_FOLDER}/${encodedUserId}/sessions.json`;
  }

  return normalizeTemplate(joinSegments(template, encodedUserId));
}

export function buildSessionFilePath(userId: string, sessionId: string) {
  return joinSegments(SESSIONS_FOLDER, encodeSegment(userId), encodeSegment(sessionId), SESSION_FILE_NAME);
}

export function buildSystemPromptFilePath(
  userId: string,
  sessionId: string,
  fileName = SYSTEM_PROMPT_FILE_NAME,
) {
  return joinSegments(
    SYSTEM_PROMPTS_FOLDER,
    encodeSegment(userId),
    encodeSegment(sessionId),
    fileName,
  );
}

export function buildKnowledgeBaseFilePath(
  userId: string,
  sessionId: string,
  fileName = KB_FILE_NAME,
) {
  return joinSegments(
    KBS_FOLDER,
    encodeSegment(userId),
    encodeSegment(sessionId),
    fileName,
  );
}

export function buildUserPromptFilePath(
  userId: string,
  sessionId: string,
  fileName = USER_PROMPT_FILE_NAME,
) {
  return joinSegments(
    USER_PROMPTS_FOLDER,
    encodeSegment(userId),
    encodeSegment(sessionId),
    fileName,
  );
}

export function buildUserFilesPrefix(userId: string) {
  return joinSegments(FILES_FOLDER, encodeSegment(userId));
}
