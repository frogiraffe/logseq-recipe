export type TokenKind =
  | "number"
  | "invalid_number"
  | "fraction"
  | "quantity_word"
  | "unit"
  | "word"
  | "range"
  | "lparen"
  | "rparen"
  | "comma"
  | "modifier"
  | "sequence"
  | "heat"
  | "symbol";

export interface Token {
  kind: TokenKind;
  raw: string;
  normalized: string | number;
  startOffset: number;
  endOffset: number;
}

export type RawToken = Token;
