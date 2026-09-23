export type StepMediaKind = "image" | "audio";

export type StepChild =
  | { id: string; kind: "note"; text: string }
  | {
      id: string;
      kind: StepMediaKind;
      text: string;
      path: string;
      alt: string;
    };

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "m4a",
  "aac",
  "ogg",
  "oga",
  "opus",
  "wav",
  "webm",
  "flac",
]);

export const STEP_MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS];

// Standard Logseq asset markup, e.g. `![photo](../assets/photo.png)`.
const MEDIA_MARKUP = /!\[([^\]]*)\]\(([^)\s]+)\)/gu;

function mediaKind(path: string): StepMediaKind | null {
  const extension = path.split(".").pop()?.toLocaleLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  return null;
}

/**
 * Normalizes a reference to a graph-local asset as `assets/...`, or null for
 * anything else: URLs and other schemes, absolute or drive paths, `..`
 * traversal, query strings, and unsupported file types are all refused, so
 * nothing outside the graph's own assets folder is ever loaded.
 */
export function safeAssetPath(raw: string): string | null {
  let path = raw.trim();
  try {
    path = decodeURI(path);
  } catch {
    return null;
  }
  if (!path || /[\\?#]/u.test(path)) return null;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(path) || path.startsWith("/")) return null;
  path = path.replace(/^\.\.?\//u, "");
  const segments = path.split("/");
  if (segments[0] !== "assets" || segments.length < 2) return null;
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    return null;
  return mediaKind(path) ? path : null;
}

/** A child block whose whole text is one safe asset reference is media. */
export function parseStepChild(id: string, text: string): StepChild {
  const matches = [...text.trim().matchAll(MEDIA_MARKUP)];
  if (matches.length === 1 && matches[0][0] === text.trim()) {
    const path = safeAssetPath(matches[0][2]);
    const kind = path ? mediaKind(path) : null;
    if (path && kind) return { id, kind, text, path, alt: matches[0][1] };
  }
  return { id, kind: "note", text };
}

/** True when text references media the plugin would refuse to load. */
export function hasUnsafeMediaMarkup(text: string): boolean {
  return [...text.matchAll(MEDIA_MARKUP)].some(
    (match) => safeAssetPath(match[2]) === null,
  );
}

/** Markup for attaching an existing graph asset (any listed path form). */
export function assetMarkup(listedPath: string): string | null {
  const index = listedPath.replace(/\\/gu, "/").lastIndexOf("assets/");
  if (index < 0) return null;
  const path = safeAssetPath(listedPath.replace(/\\/gu, "/").slice(index));
  if (!path) return null;
  const name =
    path
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/u, "") ?? "";
  return `![${name}](../${path})`;
}
