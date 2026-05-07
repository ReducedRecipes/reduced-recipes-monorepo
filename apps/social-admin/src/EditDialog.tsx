import { useState } from 'react';
import type { PendingDraft } from './api';

interface Props {
  draft: PendingDraft;
  onCancel: () => void;
  onConfirm: (patch: { caption: string; hashtags: string[] }) => void;
}

export const EditDialog = ({ draft, onCancel, onConfirm }: Props) => {
  const [caption, setCaption] = useState(draft.caption);
  const [hashtagsText, setHashtagsText] = useState(draft.hashtags.join(' '));

  const handleConfirm = () => {
    const hashtags = hashtagsText
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));
    onConfirm({ caption: caption.trim(), hashtags });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
    >
      <div className="w-full max-w-md bg-bg-2 border border-rule rounded-2xl p-5 flex flex-col gap-3">
        <h2 className="font-serif text-xl">Edit draft</h2>
        <label className="flex flex-col gap-1">
          <span className="text-caps text-ink-3">Caption</span>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={5}
            className="border border-rule rounded p-2 bg-bg text-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caps text-ink-3">Hashtags (space-separated)</span>
          <input
            type="text"
            value={hashtagsText}
            onChange={(e) => setHashtagsText(e.target.value)}
            className="border border-rule rounded p-2 bg-bg text-ink"
          />
        </label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            type="button"
            onClick={onCancel}
            className="py-3 rounded-lg border border-rule text-ink-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="py-3 rounded-lg text-white"
            style={{ background: 'var(--accent)' }}
          >
            Save & approve
          </button>
        </div>
      </div>
    </div>
  );
};
