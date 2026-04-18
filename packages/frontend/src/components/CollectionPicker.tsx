import { useCollections } from "../hooks/useCollections";

interface CollectionPickerProps {
  onSelect: (collectionId: string) => void;
  excludeId?: string;
  className?: string;
}

export function CollectionPicker({
  onSelect,
  excludeId,
  className = "",
}: CollectionPickerProps) {
  const { collections, isLoading } = useCollections();

  const filtered = excludeId
    ? collections.filter((c) => c.id !== excludeId)
    : collections;

  if (isLoading) {
    return (
      <select
        disabled
        className={`rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-400 ${className}`}
      >
        <option>Loading...</option>
      </select>
    );
  }

  return (
    <select
      onChange={(e) => {
        if (e.target.value) {
          onSelect(e.target.value);
          e.target.value = "";
        }
      }}
      defaultValue=""
      className={`rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 ${className}`}
    >
      <option value="" disabled>
        Move to collection...
      </option>
      {filtered.map((collection) => (
        <option key={collection.id} value={collection.id}>
          {collection.name}
          {collection.is_default === 1 ? " (default)" : ""}
        </option>
      ))}
    </select>
  );
}
