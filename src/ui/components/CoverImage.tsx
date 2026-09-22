import { useState } from "react";

export function CoverImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div
      className="draft-recipe-cover-placeholder"
      data-testid="recipe-cover-placeholder"
    />
  ) : (
    <img src={src} alt="" onError={() => setFailed(true)} />
  );
}
