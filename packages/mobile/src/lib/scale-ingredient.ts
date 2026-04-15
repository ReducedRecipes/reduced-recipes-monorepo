/** Parse a leading numeric quantity from an ingredient string (e.g. "1.5 cups flour" → 1.5). */
export function parseQuantity(ingredient: string): {
  quantity: number | null;
  rest: string;
} {
  const match = ingredient.match(
    /^(\d+\s+\d+\/\d+|\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)\s*/
  );
  if (!match) return { quantity: null, rest: ingredient };

  const raw = match[1];
  let value: number;

  if (raw.includes(" ") && raw.includes("/")) {
    // mixed number e.g. "1 1/2"
    const [whole, frac] = raw.split(/\s+/);
    const [num, den] = frac.split("/").map(Number);
    value = Number(whole) + num / den;
  } else if (raw.includes("/")) {
    const [num, den] = raw.split("/").map(Number);
    value = num / den;
  } else {
    value = Number(raw);
  }

  return { quantity: value, rest: ingredient.slice(match[0].length) };
}

/** Scale an ingredient string by a factor — only numeric prefix is adjusted. */
export function scaleIngredient(ingredient: string, factor: number): string {
  const { quantity, rest } = parseQuantity(ingredient);
  if (quantity === null) return ingredient;
  const scaled = Math.round(quantity * factor * 100) / 100;
  // Format nicely: drop trailing zeros
  const formatted =
    scaled === Math.floor(scaled)
      ? String(scaled)
      : scaled.toFixed(2).replace(/0+$/, "");
  return `${formatted} ${rest}`;
}
