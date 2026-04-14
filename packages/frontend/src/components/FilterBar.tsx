export interface FilterBarProps {
  tags: { tag: string; count: number }[];
  cuisines?: string[];
  activeTag?: string;
  activeCuisine?: string;
  onFilterChange: (filters: { tag?: string; cuisine?: string }) => void;
}

export default function FilterBar({
  tags,
  cuisines = [],
  activeTag,
  activeCuisine,
  onFilterChange,
}: FilterBarProps) {
  function buildFilters(tag?: string, cuisine?: string) {
    const f: { tag?: string; cuisine?: string } = {};
    if (tag) f.tag = tag;
    if (cuisine) f.cuisine = cuisine;
    return f;
  }

  return (
    <div className="flex gap-2 flex-wrap items-center">
      {(activeTag || activeCuisine) && (
        <button
          type="button"
          onClick={() => onFilterChange({})}
          className="px-3 py-1 rounded-full text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
        >
          Clear filters
        </button>
      )}

      {tags.map(({ tag, count }) => (
        <button
          key={tag}
          type="button"
          onClick={() =>
            onFilterChange(
              buildFilters(
                activeTag === tag ? undefined : tag,
                activeCuisine,
              ),
            )
          }
          className={`px-3 py-1 rounded-full text-sm transition-colors ${
            activeTag === tag
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {tag} ({count})
        </button>
      ))}

      {cuisines.length > 0 && (
        <select
          value={activeCuisine ?? ""}
          onChange={(e) =>
            onFilterChange(
              buildFilters(activeTag, e.target.value || undefined),
            )
          }
          className="px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700 border-none"
        >
          <option value="">All cuisines</option>
          {cuisines.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
