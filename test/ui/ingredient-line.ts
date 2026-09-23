// Ingredient rows render quantity and name in separate spans (a quantity
// column); match the whole visible line instead of one text node.
export function ingredientLine(text: string) {
  return (_content: string, element: Element | null) =>
    Boolean(
      element?.classList.contains("draft-recipe-ingredient-line") &&
        element.textContent?.replace(/\s+/gu, " ").trim() === text,
    );
}
