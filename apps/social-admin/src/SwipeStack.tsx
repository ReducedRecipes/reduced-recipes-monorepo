import { useEffect, useState } from 'react';
import { fetchPending, approve, reject, editApprove, type PendingDraft } from './api';
import { DraftCard } from './DraftCard';
import { EditDialog } from './EditDialog';

type Status = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' };

export const SwipeStack = () => {
  const [drafts, setDrafts] = useState<PendingDraft[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [editing, setEditing] = useState<PendingDraft | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchPending()
      .then((list) => {
        setDrafts(list);
        setStatus({ kind: 'ready' });
      })
      .catch((e: unknown) => {
        setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      });
  }, []);

  if (status.kind === 'loading') {
    return <div className="p-6 text-ink-2">Loading…</div>;
  }
  if (status.kind === 'error') {
    return <div className="p-6 text-red-700">Error: {status.message}</div>;
  }
  if (drafts.length === 0) {
    return <EmptyState />;
  }

  const top = drafts[0]!;

  const popTop = () => setDrafts((prev) => prev.slice(1));

  const handleApprove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await approve(top.id);
      popTop();
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await reject(top.id);
      popTop();
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = () => {
    if (busy) return;
    setEditing(top);
  };

  const handleEditConfirm = async (patch: { caption: string; hashtags: string[] }) => {
    if (!editing) return;
    setBusy(true);
    try {
      await editApprove(editing.id, patch);
      setEditing(null);
      popTop();
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <DraftCard
        draft={top}
        onApprove={handleApprove}
        onReject={handleReject}
        onEdit={handleEdit}
        disabled={busy}
      />
      <div className="text-caps text-ink-3 mt-6">{drafts.length} remaining</div>
      {editing ? (
        <EditDialog
          draft={editing}
          onCancel={() => setEditing(null)}
          onConfirm={handleEditConfirm}
        />
      ) : null}
    </div>
  );
};

const EmptyState = () => (
  <div className="p-10 text-center">
    <div className="text-3xl font-serif">All clear.</div>
    <div className="text-ink-2 mt-2">Nothing pending. Come back tomorrow.</div>
  </div>
);
