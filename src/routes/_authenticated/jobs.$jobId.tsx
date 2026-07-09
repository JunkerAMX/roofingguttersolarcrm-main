import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { getJob, getMe, toggleChecklistItem, uploadJobPhoto, getPhotoUrl, markJobDone } from "@/lib/jobs.functions";
import { calculateWorkerPayCents, formatWorkerPay } from "@/lib/pay";
import { ArrowLeft, MapPin, Phone, Mail, DollarSign, Wallet, Camera, Check, Lock, ImageIcon, CheckCircle2, Clock, StickyNote, X } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  component: JobDetail,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

function JobDetail() {
  const { jobId } = useParams({ from: "/_authenticated/jobs/$jobId" });
  const qc = useQueryClient();
  const fn = useServerFn(getJob);
  const meFn = useServerFn(getMe);
  const toggleFn = useServerFn(toggleChecklistItem);
  const markDoneFn = useServerFn(markJobDone);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const { data, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fn({ data: { jobId } }),
  });

  const toggle = useMutation({
    mutationFn: (v: { progressId: string; completed: boolean; note?: string }) => toggleFn({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["job", jobId] });
      const prev = qc.getQueryData<any>(["job", jobId]);
      if (prev) {
        qc.setQueryData(["job", jobId], {
          ...prev,
          progress: prev.progress.map((p: any) =>
            p.id === v.progressId ? { ...p, completed: v.completed, completed_at: v.completed ? new Date().toISOString() : null } : p,
          ),
        });
      }
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["job", jobId], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: (res, v) => {
      if (v.completed && res.paymentTrigger) {
        if (res.paymentSent) {
          toast.success("Payment link sent to client");
        } else if (!res.webhookConfigured) {
          toast.warning("Payment link not sent — webhook not configured in Settings.");
        } else {
          toast.error("Payment link failed to send. Please check the HighLevel webhook URL.");
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["job", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });


  const markDone = useMutation({
    mutationFn: () => markDoneFn({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Job marked as done 🎉");
      qc.invalidateQueries({ queryKey: ["job", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const now = useNow(15000);

  if (isLoading || !data) return <AppShell><div className="animate-pulse space-y-4"><div className="h-8 w-40 rounded bg-secondary" /><div className="h-64 rounded-2xl bg-secondary" /></div></AppShell>;

  const { job, progress } = data;
  const done = progress.filter((p: any) => p.completed).length;
  const total = progress.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const contact = job.contact;
  const jobStartMs = job.scheduled_for ? new Date(job.scheduled_for).getTime() : null;
  const isActive = jobStartMs ? jobStartMs <= now : true;
  const priorAllDone = (pos: number) => progress.filter((p: any) => p.position < pos).every((p: any) => p.completed);
  const isWorker = !!me && !me.isAdmin;

  return (
    <AppShell>
      <Link to="/today" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold">
                  {contact ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() : "Client"}
                </h1>
                <p className="text-sm text-muted-foreground">{job.job_type?.name}</p>
              </div>
              {job.price_cents && (
                <div className="text-right">
                  <div className="flex items-center justify-end gap-3">
                    <div className="font-display text-2xl font-bold text-brand-green">
                      ${Math.round(job.price_cents / 100).toLocaleString()}
                    </div>
                    {calculateWorkerPayCents(job.price_cents) > 0 && (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-brand-green/10 px-2 py-1 text-xs font-semibold text-brand-green">
                        <Wallet className="h-3.5 w-3.5" />
                        Your pay {formatWorkerPay(job.price_cents)}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{job.currency}</div>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-2 text-sm">
              {contact?.address && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent([contact.address, contact.city, contact.state, contact.postal_code].filter(Boolean).join(", "))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-2 text-foreground hover:text-brand-green"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{[contact.address, contact.city, contact.state, contact.postal_code].filter(Boolean).join(", ")}</span>
                </a>
              )}
              {contact?.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-foreground hover:text-brand-green">
                  <Phone className="h-4 w-4" /> {contact.phone}
                </a>
              )}
              {contact?.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-foreground hover:text-brand-green">
                  <Mail className="h-4 w-4" /> {contact.email}
                </a>
              )}
            </div>

            {job.notes && (
              <div className="mt-4 rounded-xl bg-secondary/60 p-3 text-sm">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Job notes</div>
                {job.notes}
              </div>
            )}
          </div>




          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Checklist</h2>
              <span className="text-sm text-muted-foreground">{done} / {total} done</span>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-gradient-to-r from-brand-green to-brand-lime transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
            </div>

            {!isActive && jobStartMs && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-brand-yellow/50 bg-brand-yellow/10 p-3 text-sm">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-yellow-800" />
                <div>
                  <div className="font-semibold text-yellow-900">Job not active yet</div>
                  <div className="text-yellow-900/80">
                    Starts {format(new Date(jobStartMs), "EEE d MMM 'at' h:mm a")} · in {formatDistanceToNow(new Date(jobStartMs))}. You can review the details now — tasks unlock at the appointment time.
                  </div>
                </div>
              </div>
            )}
            <ul className="space-y-2">
              {progress.map((p: any) => (
              <ChecklistRow
                  key={p.id}
                  item={p}
                  jobId={jobId}
                  pending={toggle.isPending && toggle.variables?.progressId === p.id}
                  disabled={!isActive || (toggle.isPending && toggle.variables?.progressId === p.id) || (p.input_type === "payment_trigger" && !priorAllDone(p.position))}
                  onToggle={(completed, note) => toggle.mutate({ progressId: p.id, completed, note })}
                />
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-4 pb-28 lg:pb-4">
          <PhotoGallery jobId={jobId} photos={data.photos} />
        </div>
      </div>

      {total > 0 && job.status !== "completed" && (() => {
        const allDone = done === total;
        const remaining = total - done;
        return (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] animate-fade-in">
            <div className="mx-auto max-w-md">
              {allDone && isWorker && calculateWorkerPayCents(job.price_cents) > 0 && (
                <div className="pointer-events-auto mb-2 text-center text-sm font-medium text-brand-green">
                  Complete this job to earn {formatWorkerPay(job.price_cents)}
                </div>
              )}
              <button
                onClick={() => allDone && markDone.mutate()}
                disabled={!allDone || markDone.isPending}
                aria-disabled={!allDone}
                className={cn(
                  "pointer-events-auto flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold shadow-2xl transition-all duration-200 ease-out disabled:cursor-not-allowed",
                  allDone
                    ? "bg-brand-green text-white shadow-brand-green/40 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-6px_rgba(74,163,74,0.45)] active:scale-[0.97] disabled:opacity-70"
                    : "bg-muted text-muted-foreground shadow-black/10",
                )}
              >
                {allDone ? <CheckCircle2 className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                {markDone.isPending
                  ? "Saving…"
                  : allDone
                  ? "Mark job as done"
                  : `Complete ${remaining} more ${remaining === 1 ? "task" : "tasks"} to finish`}
              </button>
            </div>
          </div>
        );
      })()}


      {job.status === "completed" && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-brand-green/40 bg-brand-green/10 p-4 text-brand-green">
          <CheckCircle2 className="h-5 w-5" /> <span className="font-semibold">Job completed</span>
        </div>
      )}
    </AppShell>
  );
}

function ChecklistRow({ item, jobId, disabled, pending, onToggle }: { item: any; jobId: string; disabled: boolean; pending?: boolean; onToggle: (c: boolean, note?: string) => void }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const isPhoto = item.input_type === "photo_before" || item.input_type === "photo_after";
  const isPayment = item.input_type === "payment_trigger";
  const isNote = item.input_type === "note";

  const handleClick = () => {
    if (disabled || pending) return;
    if (isPhoto && !item.completed) {
      setUploadOpen(true);
      return;
    }
    if (isNote) {
      setNoteOpen(true);
      return;
    }
    onToggle(!item.completed);
  };

  return (
    <>
      <li>
        <button
          onClick={handleClick}
          disabled={disabled || pending}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 ease-out active:scale-[0.99]",
            item.completed
              ? "border-brand-green/40 bg-brand-green/5"
              : disabled
              ? "border-border bg-muted/30 opacity-60"
              : "border-border bg-background hover:border-brand-lime hover:bg-brand-lime/5",
            isPayment && !disabled && !item.completed && "border-brand-yellow bg-brand-yellow/10",
          )}
        >
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200 ease-out",
              item.completed ? "scale-110 border-brand-green bg-brand-green text-white" : "scale-100 border-border",
            )}
          >
            {item.completed && <Check className="h-4 w-4 animate-scale-in" />}
            {!item.completed && disabled && !pending && <Lock className="h-3 w-3 text-muted-foreground" />}
          </span>
          <span className={cn("flex-1 text-sm font-medium transition-all duration-200", item.completed && "text-muted-foreground line-through")}>{item.title}</span>
          {isPhoto && <Camera className="h-4 w-4 text-brand-green" />}
          {isPayment && <DollarSign className="h-4 w-4 text-brand-yellow" />}
          {isNote && <StickyNote className="h-4 w-4 text-brand-green" />}
        </button>
        {isNote && item.completed && item.note && (
          <button
            onClick={() => !disabled && !pending && setNoteOpen(true)}
            className="mt-1.5 flex w-full items-start gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-left text-xs text-foreground/80 hover:bg-secondary"
          >
            <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-green" />
            <span className="whitespace-pre-wrap">{item.note}</span>
          </button>
        )}
        {isPayment && item.completed && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-brand-green/10 px-2.5 py-1.5 text-xs font-medium text-brand-green">
            <CheckCircle2 className="h-3.5 w-3.5" /> Payment link sent to client
          </div>
        )}
      </li>

      {uploadOpen && (
        <PhotoUploadDialog
          jobId={jobId}
          progressId={item.id}
          kind={item.input_type === "photo_before" ? "before" : "after"}
          title={item.title}
          onClose={() => setUploadOpen(false)}
        />
      )}

      {noteOpen && (
        <NoteDialog
          title={item.title}
          initial={item.note ?? ""}
          onClose={() => setNoteOpen(false)}
          onSave={(note) => {
            onToggle(true, note);
            setNoteOpen(false);
          }}
        />
      )}
    </>
  );
}

function NoteDialog({ title, initial, onClose, onSave }: { title: string; initial: string; onClose: () => void; onSave: (note: string) => void }) {
  const [value, setValue] = useState(initial);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Note</div>
            <h3 className="font-display text-lg font-semibold">{title}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={5}
          placeholder="Write a note…"
          className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">
            Cancel
          </button>
          <button
            onClick={() => onSave(value.trim())}
            disabled={!value.trim()}
            className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] disabled:opacity-50 disabled:hover:translate-y-0"
          >
            Save note
          </button>
        </div>
      </div>
    </div>
  );
}


function PhotoUploadDialog({ jobId, progressId, kind, title, onClose }: { jobId: string; progressId: string; kind: "before" | "after"; title: string; onClose: () => void }) {
  const qc = useQueryClient();
  const uploadFn = useServerFn(uploadJobPhoto);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      await uploadFn({ data: { jobId, progressId, kind, fileBase64: b64, contentType: file.type || "image/jpeg", ext } });
      toast.success("Photo uploaded");
      qc.invalidateQueries({ queryKey: ["job", jobId] });
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold">Upload {kind} photo</h3>
        <p className="mt-1 text-sm text-muted-foreground">{title}</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-medium text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.97] disabled:opacity-60"
        >
          <Camera className="h-5 w-5" />
          {uploading ? "Uploading…" : "Take / Choose photo"}
        </button>
        <button onClick={onClose} className="mt-2 w-full rounded-xl py-2 text-sm text-muted-foreground transition-all duration-200 ease-out hover:bg-secondary active:scale-[0.98]">
          Cancel
        </button>
      </div>
    </div>
  );
}

function PhotoGallery({ jobId, photos }: { jobId: string; photos: any[] }) {
  const fn = useServerFn(getPhotoUrl);
  const [urls, setUrls] = useState<Record<string, string>>({});

  async function load(path: string) {
    if (urls[path]) return;
    const { url } = await fn({ data: { path } });
    setUrls((u) => ({ ...u, [path]: url }));
  }

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <ImageIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
        No photos yet
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 font-display font-semibold">Photos ({photos.length})</h3>
      <div className="grid grid-cols-2 gap-2">
        {photos.map((p: any) => {
          if (!urls[p.storage_path]) load(p.storage_path);
          return (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-secondary">
              {urls[p.storage_path] ? (
                <img src={urls[p.storage_path]} alt={p.kind} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading…</div>
              )}
              <span className={cn(
                "absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                p.kind === "before" ? "bg-brand-yellow text-yellow-900" : "bg-brand-green text-white",
              )}>{p.kind}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
