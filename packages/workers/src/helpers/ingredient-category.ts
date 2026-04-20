/**
 * Keyword-based ingredient → supermarket aisle classifier.
 * First matching rule wins. Fallback is 'Other'.
 */

export type AisleCategory =
  | 'Produce'
  | 'Dairy & Eggs'
  | 'Meat & Seafood'
  | 'Pantry'
  | 'Spices & Seasonings'
  | 'Bakery'
  | 'Frozen'
  | 'Beverages'
  | 'Condiments & Sauces'
  | 'Oils & Vinegars'
  | 'Other';

const RULES: [AisleCategory, RegExp][] = [
  // Spices first — they're common and easily confused with produce
  ['Spices & Seasonings', /\b(salt|pepper|cumin|cinnamon|paprika|turmeric|oregano|basil|thyme|rosemary|parsley|cilantro|coriander|dill|sage|bay leaf|bay leave|chili powder|chilli|cayenne|nutmeg|clove|cardamom|ginger|saffron|vanilla|curry|mustard seed|fennel seed|caraway|allspice|anise|star anise|fenugreek|sumac|za'atar|zaatar|herb|spice|seasoning|italian seasoning|garlic powder|onion powder|smoked paprika|red pepper flake|black pepper|white pepper|ground ginger)\b/],

  // Oils & Vinegars
  ['Oils & Vinegars', /\b(olive oil|vegetable oil|canola oil|coconut oil|sesame oil|avocado oil|sunflower oil|peanut oil|cooking oil|oil|vinegar|balsamic|red wine vinegar|white wine vinegar|apple cider vinegar|rice vinegar)\b/],

  // Condiments & Sauces
  ['Condiments & Sauces', /\b(soy sauce|fish sauce|worcestershire|ketchup|mustard|mayo|mayonnaise|hot sauce|sriracha|tabasco|barbecue sauce|bbq sauce|teriyaki|hoisin|oyster sauce|tomato paste|tomato sauce|salsa|pesto|tahini|harissa|miso|sambal|chutney|relish|jam|jelly|honey|maple syrup|molasses|agave)\b/],

  // Dairy & Eggs
  ['Dairy & Eggs', /\b(milk|cream|butter|cheese|yogurt|yoghurt|egg|sour cream|cream cheese|ricotta|mozzarella|parmesan|cheddar|gruyere|feta|gouda|brie|mascarpone|cottage cheese|whipping cream|heavy cream|half and half|buttermilk|ghee|creme fraiche|quark|kefir|custard)\b/],

  // Meat & Seafood
  ['Meat & Seafood', /\b(chicken|beef|pork|lamb|turkey|duck|veal|venison|rabbit|bacon|sausage|ham|prosciutto|salami|pepperoni|ground beef|ground turkey|ground pork|steak|roast|rib|loin|thigh|breast|drumstick|wing|salmon|tuna|shrimp|prawn|cod|tilapia|halibut|trout|bass|crab|lobster|mussel|clam|oyster|scallop|squid|calamari|anchovy|sardine|mackerel|fish|seafood|mince|chorizo|pancetta|guanciale)\b/],

  // Produce
  ['Produce', /\b(tomato|tomatoe|onion|garlic|potato|carrot|celery|pepper|bell pepper|lettuce|spinach|kale|arugula|broccoli|cauliflower|zucchini|squash|eggplant|aubergine|cucumber|corn|pea|bean|green bean|asparagus|artichoke|leek|shallot|scallion|spring onion|radish|beet|turnip|parsnip|sweet potato|yam|mushroom|avocado|lemon|lime|orange|apple|banana|berry|blueberry|raspberry|strawberry|cranberry|grape|pear|peach|plum|mango|pineapple|watermelon|melon|coconut|fig|date|pomegranate|kiwi|grapefruit|cabbage|bok choy|fennel|okra|jalapeno|serrano|habanero|poblano|chili pepper|fresh herb|mint|chive|lemongrass|ginger root|galangal|turmeric root|plantain|rhubarb|endive|watercress|romaine|cherry tomato|grape tomato|sun.dried tomato|roma tomato|heirloom|tomatillo)\b/],

  // Bakery
  ['Bakery', /\b(bread|tortilla|pita|naan|baguette|croissant|roll|bun|muffin|bagel|flatbread|brioche|sourdough|ciabatta|focaccia|wrap|crouton|breadcrumb|panko)\b/],

  // Beverages
  ['Beverages', /\b(water|coffee|tea|juice|wine|beer|broth|stock|chicken stock|beef stock|vegetable stock|chicken broth|beef broth|vegetable broth|coconut milk|almond milk|oat milk|soda|sparkling water|club soda|tonic|rum|vodka|whiskey|bourbon|brandy|gin|tequila|sake|mirin|sherry|port|marsala|cooking wine|red wine|white wine)\b/],

  // Frozen
  ['Frozen', /\b(frozen|ice cream|sorbet|gelato|frozen yogurt|puff pastry|phyllo|filo)\b/],

  // Pantry — broad catch-all for dry goods, grains, canned, baking
  ['Pantry', /\b(flour|sugar|rice|pasta|noodle|spaghetti|penne|linguine|fettuccine|macaroni|lasagna|oat|oatmeal|cereal|granola|quinoa|couscous|bulgur|barley|lentil|chickpea|black bean|kidney bean|white bean|pinto bean|navy bean|canned|can of|diced tomato|crushed tomato|tomato can|baking soda|baking powder|yeast|cornstarch|corn starch|gelatin|cocoa|chocolate|chocolate chip|vanilla extract|almond extract|nut|almond|walnut|pecan|cashew|pistachio|peanut|hazelnut|pine nut|sesame seed|sunflower seed|pumpkin seed|chia seed|flax|hemp|poppy seed|raisin|dried fruit|dried cranberry|apricot dried|prune|coconut flake|shredded coconut|caster sugar|powdered sugar|confectioner|brown sugar|demerara|turbinado|corn syrup|condensed milk|evaporated milk|coconut cream|tortilla chip|cracker|chip|polenta|cornmeal|semolina|tapioca|arrowroot|xanthan|agar|nutritional yeast|soy|tofu|tempeh|seitan)\b/],
];

export function classifyIngredient(name: string): AisleCategory {
  if (!name) return 'Other';
  const lower = name.toLowerCase();
  for (const [category, pattern] of RULES) {
    if (pattern.test(lower)) return category;
  }
  return 'Other';
}
