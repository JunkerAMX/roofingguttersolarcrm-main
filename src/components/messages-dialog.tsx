import { useEffect } from "react";
import { X } from "lucide-react";
import { JobMessages } from "./job-messages";

export function MessagesDialog({ jobId, currentUserId, targetMessageId, onClose }: { jobId: string; currentUserId?: string; targetMessageId?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 animate-fade-in" onClick={onClose}>
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl animate-scale-in sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-display text-base font-semibold">Messages</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-hidden">
          <JobMessages jobId={jobId} currentUserId={currentUserId} targetMessageId={targetMessageId} />
        </div>
      </div>
    </div>
  );
}
