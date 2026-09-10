export const VISITOR_ID_STORAGE_KEY = "dj-companion-client-id";
export const VISITOR_ID_HEADER = "x-client-id";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let memoryVisitorId: string | null = null;

export function parseVisitorClientId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export function isMissingClientIdColumnError(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("client_id") && lower.includes("does not exist");
}

export function readVisitorClientId(
  request: {
    headers: { get(name: string): string | null };
    nextUrl?: { searchParams: { get(name: string): string | null } };
  },
  bodyClientId?: unknown
): string | null {
  return (
    parseVisitorClientId(request.headers.get(VISITOR_ID_HEADER)) ??
    parseVisitorClientId(request.nextUrl?.searchParams.get("client_id")) ??
    parseVisitorClientId(bodyClientId)
  );
}

function createVisitorId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let loggedVisitorId = false;

/** Browser-only. Persists in localStorage; falls back to a session memory id. */
export function getVisitorClientId(): string {
  if (memoryVisitorId) {
    logVisitorId(memoryVisitorId);
    return memoryVisitorId;
  }

  if (typeof window === "undefined") {
    return "";
  }

  try {
    const existing = parseVisitorClientId(localStorage.getItem(VISITOR_ID_STORAGE_KEY));
    if (existing) {
      memoryVisitorId = existing;
      logVisitorId(existing);
      return existing;
    }

    const id = createVisitorId();
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, id);
    memoryVisitorId = id;
    logVisitorId(id);
    return id;
  } catch {
    if (!memoryVisitorId) memoryVisitorId = createVisitorId();
    logVisitorId(memoryVisitorId);
    return memoryVisitorId;
  }
}

function logVisitorId(id: string): void {
  if (loggedVisitorId || typeof window === "undefined") return;
  loggedVisitorId = true;
  console.info(`[mixinkey] visitor client_id ${id}`);
}

export function visitorRequestHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const clientId = getVisitorClientId();
  if (clientId) headers.set(VISITOR_ID_HEADER, clientId);
  return headers;
}

export function visitorFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: visitorRequestHeaders(init?.headers),
  });
}
