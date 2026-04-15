const CATEGORIES: Record<string, string[]> = {
  Produce: [
    "apple", "avocado", "banana", "basil", "bell pepper", "broccoli",
    "cabbage", "carrot", "celery", "cilantro", "corn", "cucumber",
    "eggplant", "garlic", "ginger", "grape", "green bean", "kale",
    "lemon", "lettuce", "lime", "mango", "mushroom", "onion", "orange",
    "parsley", "pea", "peach", "pear", "pepper", "pineapple", "potato",
    "pumpkin", "radish", "scallion", "shallot", "spinach", "squash",
    "strawberry", "sweet potato", "tomato", "zucchini",
  ],
  Dairy: [
    "butter", "cheddar", "cheese", "cottage cheese", "cream",
    "cream cheese", "egg", "feta", "gouda", "half-and-half",
    "heavy cream", "milk", "mozzarella", "parmesan", "ricotta",
    "sour cream", "whipping cream", "yogurt",
  ],
  Meat: [
    "bacon", "beef", "brisket", "chicken", "chorizo", "clam", "cod",
    "crab", "duck", "ground beef", "ground turkey", "ham", "lamb",
    "lobster", "mussels", "pork", "prawn", "rib", "salmon", "sausage",
    "scallop", "shrimp", "steak", "tilapia", "tuna", "turkey", "veal",
  ],
  Pantry: [
    "baking powder", "baking soda", "bread", "breadcrumbs", "broth",
    "brown sugar", "canned tomato", "chickpea", "cocoa", "coconut milk",
    "cornstarch", "flour", "honey", "jam", "ketchup", "lentil",
    "maple syrup", "mayonnaise", "mustard", "noodle", "oat", "oil",
    "olive oil", "pasta", "peanut butter", "rice", "sesame oil",
    "soy sauce", "stock", "sugar", "tomato paste", "tomato sauce",
    "vanilla", "vegetable oil", "vinegar",
  ],
  Spices: [
    "allspice", "bay leaf", "black pepper", "cardamom", "cayenne",
    "chili flake", "chili powder", "cinnamon", "clove", "coriander",
    "cumin", "curry powder", "dill", "fennel seed", "garam masala",
    "marjoram", "nutmeg", "oregano", "paprika", "red pepper flake",
    "rosemary", "saffron", "sage", "salt", "smoked paprika", "star anise",
    "tarragon", "thyme", "turmeric", "white pepper",
  ],
};

// Build a flat list sorted by keyword length descending so that more specific
// matches (e.g. "canned tomato", "black pepper") are tested before shorter
// substrings (e.g. "tomato", "pepper").
const SORTED_ENTRIES: Array<[string, string]> = Object.entries(CATEGORIES)
  .flatMap(([category, keywords]) =>
    keywords.map((kw): [string, string] => [kw, category]),
  )
  .sort((a, b) => b[0].length - a[0].length);

export function categoriseIngredient(ingredient: string): string {
  const lower = ingredient.toLowerCase().trim();

  for (const [keyword, category] of SORTED_ENTRIES) {
    if (lower.includes(keyword)) {
      return category;
    }
  }

  return "Other";
}
