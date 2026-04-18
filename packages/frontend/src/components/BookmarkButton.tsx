import { useState, useRef, useEffect } from "react";
import { useBookmarks } from "../hooks/useBookmarks";
import { useAuth } from "../hooks/useAuth";
import { CollectionPicker } from "./CollectionPicker";
import { createBookmark } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";

interface BookmarkButtonProps {
  recipeId: string;
  className?: string;
  compact?: boolean;
}

export function BookmarkButton({ recipeId, className = "", compact = false }: BookmarkButtonProps) {
  const { isBookmarked, toggle } = useBookmarks();
  const { isAuthenticated, login } = useAuth();
  const bookmarked = isBookmarked(recipeId);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Close picker when clicking outside
  useEffect(() => {
    if (!showPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPicker]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      login();
      return;
    }
    toggle(recipeId);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      login();
      return;
    }
    setShowPicker((prev) => !prev);
  };

  const handleCollectionSelect = async (collectionId: string) => {
    setShowPicker(false);
    await createBookmark(recipeId, collectionId);
    queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
  };

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`inline-flex items-center justify-center ${compact ? "p-1" : "p-2"} rounded-full transition-colors hover:bg-gray-100 ${className}`}
        aria-label={bookmarked ? "Remove bookmark" : "Add bookmark"}
        title="Right-click to save to a collection"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className={`${compact ? "h-5 w-5" : "h-6 w-6"} ${bookmarked ? "fill-red-500 stroke-red-500" : "fill-none stroke-gray-500"}`}
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
          />
        </svg>
      </button>

      {showPicker && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <p className="mb-1 px-1 text-xs font-medium text-gray-500">
            Save to collection
          </p>
          <CollectionPicker
            onSelect={handleCollectionSelect}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
