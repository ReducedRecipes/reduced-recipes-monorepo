import { Link } from "react-router-dom";
import type { RecipeSummary } from "@rr/shared/types";

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}

export default function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  return (
    <Link
      to={`/recipe/${recipe.id}`}
      className="rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden block"
    >
      {recipe.image_url ? (
        <img
          src={recipe.image_url}
          alt={recipe.title}
          loading="lazy"
          className="aspect-[3/2] w-full object-cover"
        />
      ) : (
        <div className="aspect-[3/2] w-full bg-gray-200" />
      )}
      <div className="p-3">
        <h3 className="font-semibold line-clamp-2">{recipe.title}</h3>
        <p className="text-sm text-gray-500">{recipe.domain}</p>
        {recipe.total_time != null && (
          <p className="text-sm text-gray-600 mt-1">
            {formatTime(recipe.total_time)}
          </p>
        )}
      </div>
    </Link>
  );
}
