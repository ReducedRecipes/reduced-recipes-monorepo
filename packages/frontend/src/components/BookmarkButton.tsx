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
    <div style={{ position: "relative" }} ref={pickerRef}>
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: compact ? 4 : 8,
          background: "none",
          border: "none",
        }}
        aria-label={bookmarked ? "Remove bookmark" : "Add bookmark"}
        title="Right-click to save to a collection"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          style={{
            width: compact ? 18 : 22,
            height: compact ? 18 : 22,
            fill: bookmarked ? "var(--accent)" : "none",
            stroke: bookmarked ? "var(--accent)" : "var(--ink-3)",
            strokeWidth: 2,
          }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
          />
        </svg>
      </button>

      {showPicker && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 20,
            marginTop: 4,
            width: 220,
            border: "1px solid var(--rule-2)",
            background: "var(--bg)",
            padding: 8,
          }}
        >
          <div className="caps" style={{ color: "var(--ink-3)", marginBottom: 6, paddingLeft: 4 }}>
            Save to collection
          </div>
          <CollectionPicker
            onSelect={handleCollectionSelect}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
