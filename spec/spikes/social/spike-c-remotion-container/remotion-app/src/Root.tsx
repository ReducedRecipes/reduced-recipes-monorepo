import { Composition } from 'remotion';
import { RecipeCard, recipeCardSchema } from './RecipeCard';

const FPS = 30;
const DURATION_S = 25;

export const Root = () => (
  <Composition
    id="RecipeCard"
    component={RecipeCard}
    durationInFrames={FPS * DURATION_S}
    fps={FPS}
    width={1080}
    height={1920}
    schema={recipeCardSchema}
    defaultProps={{
      hookText: 'The 4-ingredient pasta nobody talks about',
      ingredients: ['spaghetti', 'guanciale', 'pecorino', 'black pepper'],
      steps: ['Boil pasta 8 min', 'Crisp guanciale', 'Whisk eggs + cheese', 'Toss off heat'],
      statsText: '20 min · Serves 2',
      ctaText: 'Full recipe, no scroll',
    }}
  />
);
