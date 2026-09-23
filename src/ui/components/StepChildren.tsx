import { useEffect, useState } from "react";
import type { StepChild } from "../../domain/step-media";
import type { UiMessages } from "../i18n";

type MediaChild = Extract<StepChild, { kind: "image" | "audio" }>;

function StepMedia({
  child,
  messages,
  resolveAssetUrl,
}: {
  child: MediaChild;
  messages: UiMessages;
  resolveAssetUrl?(path: string): Promise<string | null>;
}) {
  // undefined = resolving, null = missing/unreadable.
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    setUrl(undefined);
    if (!resolveAssetUrl) {
      setUrl(null);
      return undefined;
    }
    resolveAssetUrl(child.path).then(
      (resolved) => active && setUrl(resolved),
      () => active && setUrl(null),
    );
    return () => {
      active = false;
    };
  }, [child.path, resolveAssetUrl]);

  if (url === undefined) return null;
  if (url === null) {
    return (
      <p className="draft-recipe-media-missing" role="note">
        {`${messages.mediaMissing}: ${child.path}`}
      </p>
    );
  }
  if (child.kind === "image") {
    return (
      <img
        className="draft-recipe-step-image"
        src={url}
        alt={child.alt || child.path}
        loading="lazy"
        onError={() => setUrl(null)}
      />
    );
  }
  return (
    // biome-ignore lint/a11y/useMediaCaption: user-supplied graph audio has no caption track to offer.
    <audio
      className="draft-recipe-step-audio"
      controls
      preload="metadata"
      src={url}
      aria-label={child.alt || child.path}
      onError={() => setUrl(null)}
    />
  );
}

export function StepChildren({
  items,
  messages,
  resolveAssetUrl,
}: {
  items: StepChild[] | undefined;
  messages: UiMessages;
  resolveAssetUrl?(path: string): Promise<string | null>;
}) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="draft-recipe-step-children">
      {items.map((child) => (
        <li key={child.id} className={`draft-recipe-step-${child.kind}`}>
          {child.kind === "note" ? (
            child.text
          ) : (
            <StepMedia
              child={child}
              messages={messages}
              resolveAssetUrl={resolveAssetUrl}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
