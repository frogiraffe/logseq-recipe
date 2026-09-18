export const enLexerCases = [
  {
    text: "1 1/2 cups flour",
    kinds: ["number", "fraction", "unit", "word"],
    normalized: [1, 0.5, "cup", "flour"],
  },
] as const;
