export const frLexerCases = [
  {
    text: "½ tasse de lait",
    kinds: ["fraction", "unit", "word", "word"],
    normalized: [0.5, "cup", "de", "lait"],
  },
] as const;
