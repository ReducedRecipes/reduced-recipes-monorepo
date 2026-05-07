import type { PendingDraft } from './api';

interface Props {
  draft: PendingDraft;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  disabled?: boolean;
}

export const DraftCard = ({ draft, onApprove, onReject, onEdit, disabled = false }: Props) => {
  return (
    <article className="w-full max-w-md bg-bg-2 border border-rule rounded-2xl overflow-hidden shadow-sm">
      <div className="aspect-[2/3] w-full bg-bg overflow-hidden">
        {draft.pinPreviewUrl ? (
          // Pin preview from R2 public bucket. Falls back to alt text on error.
          <img
            src={draft.pinPreviewUrl}
            alt={draft.caption.slice(0, 80)}
            className="w-full h-full object-cover"
            loading="eager"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-3">
            no preview
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-caps uppercase text-ink-3">{draft.platform}</span>
          {draft.hook ? <span className="text-caps text-accent-ink">{draft.hook}</span> : null}
        </div>

        <p className="text-ink text-sm whitespace-pre-line">{draft.caption}</p>

        {draft.hashtags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {draft.hashtags.map((h) => (
              <span key={h} className="text-caps text-ink-2 bg-bg px-2 py-0.5 rounded">
                {h.startsWith('#') ? h : `#${h}`}
              </span>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2 mt-2">
          <button
            type="button"
            onClick={onReject}
            disabled={disabled}
            className="py-3 rounded-lg border border-rule text-ink-2 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={disabled}
            className="py-3 rounded-lg border border-rule text-ink disabled:opacity-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={disabled}
            className="py-3 rounded-lg bg-accent text-white disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Approve
          </button>
        </div>
      </div>
    </article>
  );
};
