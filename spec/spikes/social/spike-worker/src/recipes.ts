// 20 representative recipes spanning cuisines, difficulty, and time bands.
// Used as input fixtures for both Spike A (Llama JSON) and Spike B (image gen prompt construction).

export type SampleRecipe = {
  title: string;
  cuisine: string;
  total_time: string;
  difficulty: 'easy' | 'medium' | 'hard';
  top_ingredients: string[];
  source_site: string;
};

export const SAMPLE_RECIPES: SampleRecipe[] = [
  { title: 'Spaghetti Carbonara', cuisine: 'Italian', total_time: '20 min', difficulty: 'easy', top_ingredients: ['spaghetti', 'guanciale', 'pecorino', 'eggs', 'black pepper'], source_site: 'example-italian.com' },
  { title: 'Chicken Tikka Masala', cuisine: 'Indian', total_time: '45 min', difficulty: 'medium', top_ingredients: ['chicken thighs', 'yogurt', 'garam masala', 'tomato', 'cream'], source_site: 'example-curry.com' },
  { title: 'Beef Bourguignon', cuisine: 'French', total_time: '3 hours', difficulty: 'hard', top_ingredients: ['beef chuck', 'red wine', 'pearl onions', 'mushrooms', 'bacon'], source_site: 'example-french.com' },
  { title: 'Pad Thai', cuisine: 'Thai', total_time: '25 min', difficulty: 'medium', top_ingredients: ['rice noodles', 'shrimp', 'tamarind', 'peanuts', 'bean sprouts'], source_site: 'example-thai.com' },
  { title: 'Tacos al Pastor', cuisine: 'Mexican', total_time: '40 min', difficulty: 'medium', top_ingredients: ['pork shoulder', 'pineapple', 'achiote', 'corn tortillas', 'onion'], source_site: 'example-mex.com' },
  { title: 'Greek Moussaka', cuisine: 'Greek', total_time: '90 min', difficulty: 'hard', top_ingredients: ['eggplant', 'ground lamb', 'bechamel', 'tomato', 'cinnamon'], source_site: 'example-greek.com' },
  { title: 'Vegan Buddha Bowl', cuisine: 'Modern', total_time: '30 min', difficulty: 'easy', top_ingredients: ['quinoa', 'chickpeas', 'sweet potato', 'kale', 'tahini'], source_site: 'example-veg.com' },
  { title: 'Chocolate Chip Cookies', cuisine: 'American Baking', total_time: '35 min', difficulty: 'easy', top_ingredients: ['butter', 'brown sugar', 'flour', 'chocolate chips', 'vanilla'], source_site: 'example-baking.com' },
  { title: 'Beef Wellington', cuisine: 'British', total_time: '2.5 hours', difficulty: 'hard', top_ingredients: ['beef tenderloin', 'puff pastry', 'mushroom duxelles', 'prosciutto', 'mustard'], source_site: 'example-brit.com' },
  { title: 'Vietnamese Pho', cuisine: 'Vietnamese', total_time: '4 hours', difficulty: 'medium', top_ingredients: ['beef bones', 'rice noodles', 'star anise', 'ginger', 'fish sauce'], source_site: 'example-pho.com' },
  { title: 'Risotto alla Milanese', cuisine: 'Italian', total_time: '40 min', difficulty: 'medium', top_ingredients: ['arborio rice', 'saffron', 'parmesan', 'white wine', 'beef stock'], source_site: 'example-risotto.com' },
  { title: 'Baba Ganoush', cuisine: 'Middle Eastern', total_time: '45 min', difficulty: 'easy', top_ingredients: ['eggplant', 'tahini', 'lemon juice', 'garlic', 'olive oil'], source_site: 'example-meze.com' },
  { title: 'Korean Bibimbap', cuisine: 'Korean', total_time: '50 min', difficulty: 'medium', top_ingredients: ['rice', 'beef bulgogi', 'spinach', 'gochujang', 'fried egg'], source_site: 'example-kor.com' },
  { title: 'Lemon Drizzle Cake', cuisine: 'British Baking', total_time: '60 min', difficulty: 'easy', top_ingredients: ['flour', 'butter', 'lemons', 'sugar', 'eggs'], source_site: 'example-bake.com' },
  { title: 'Massaman Curry', cuisine: 'Thai', total_time: '70 min', difficulty: 'medium', top_ingredients: ['beef chuck', 'coconut milk', 'massaman paste', 'potatoes', 'peanuts'], source_site: 'example-thai2.com' },
  { title: 'Shakshuka', cuisine: 'North African', total_time: '30 min', difficulty: 'easy', top_ingredients: ['tomatoes', 'eggs', 'bell peppers', 'cumin', 'feta'], source_site: 'example-shak.com' },
  { title: 'Creme Brulee', cuisine: 'French Dessert', total_time: '4 hours (mostly chill)', difficulty: 'medium', top_ingredients: ['cream', 'egg yolks', 'sugar', 'vanilla bean', 'salt'], source_site: 'example-patisserie.com' },
  { title: 'Beef and Broccoli Stir Fry', cuisine: 'Chinese-American', total_time: '20 min', difficulty: 'easy', top_ingredients: ['flank steak', 'broccoli', 'soy sauce', 'ginger', 'garlic'], source_site: 'example-stirfry.com' },
  { title: 'Chana Masala', cuisine: 'Indian', total_time: '35 min', difficulty: 'easy', top_ingredients: ['chickpeas', 'tomatoes', 'onion', 'garam masala', 'ginger'], source_site: 'example-chana.com' },
  { title: 'One-Pan Lemon Garlic Chicken', cuisine: 'Modern Weeknight', total_time: '30 min', difficulty: 'easy', top_ingredients: ['chicken thighs', 'lemon', 'garlic', 'rosemary', 'olive oil'], source_site: 'example-weeknight.com' },
];
