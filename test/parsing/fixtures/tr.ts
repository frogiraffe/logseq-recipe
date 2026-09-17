export const trLexerCases = [
  {
    text: "1,5 yemek kaşığı kakao",
    kinds: ["number", "unit", "word"],
    normalized: [1.5, "tbsp", "kakao"],
  },
] as const;
