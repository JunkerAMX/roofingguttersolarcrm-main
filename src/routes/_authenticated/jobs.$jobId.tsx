import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { MessagesDialog } from "@/components/messages-dialog";
import { getJob, getMe, toggleChecklistItem, uploadJobPhoto, getPhotoUrl, markJobDone } from "@/lib/jobs.functions";
import { listJobMessages } from "@/lib/messaging.functions";
import { calculateWorkerPayCents, formatWorkerPay } from "@/lib/pay";
import { ArrowLeft, MapPin, Phone, Mail, DollarSign, Wallet, Camera, Check, Lock, ImageIcon, CheckCircle2, Clock, StickyNote, X, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useScramble } from "@/hooks/use-scramble";
import { formatJobDateTime, getJobTimeZone } from "@/lib/time";



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
  useRealtimeInvalidate(["jobs", "job_checklist_progress", "job_messages"], [["job", jobId], ["jobs"], ["jobMessages", jobId]]);
  const msgsFn = useServerFn(listJobMessages);
  const { data: msgList = [] } = useQuery({
    queryKey: ["jobMessages", jobId],
    queryFn: () => msgsFn({ data: { jobId } }),
    refetchOnWindowFocus: true,
    refetchInterval: 20000,
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
      import("canvas-confetti").then(({ default: confetti }) => {
        const colors = ["#2E8B57", "#9ACD32", "#F0E68C", "#228B22", "#ADFF2F"];
        const end = Date.now() + 1500;
        const frame = () => {
          confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors,
            disableForReducedMotion: true,
          });
          confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors,
            disableForReducedMotion: true,
          });
          if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();
      });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const now = useNow(15000);
  const [msgOpen, setMsgOpen] = useState(false);
  const seenKey = `job-msg-seen:${jobId}`;
  const [lastSeen, setLastSeen] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(window.localStorage.getItem(seenKey)) || 0;
  });
  useEffect(() => {
    if (msgOpen) {
      const now = Date.now();
      window.localStorage.setItem(seenKey, String(now));
      setLastSeen(now);
    }
  }, [msgOpen, seenKey, msgList.length]);
  const unreadCount = msgList.filter((m: any) => m.sender_id !== me?.userId && new Date(m.created_at).getTime() > lastSeen).length;
  const { scrambleFirst, scrambleLast, scrambleAddress, scrambleCity, scramblePhone, scrambleEmail } = useScramble();

  if (isLoading || !data) return <AppShell><div className="animate-pulse space-y-4"><div className="h-8 w-40 rounded bg-secondary" /><div className="h-64 rounded-2xl bg-secondary" /></div></AppShell>;

  const { job, progress } = data;
  const done = progress.filter((p: any) => p.completed).length;
  const total = progress.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const contact = job.contact;
  const displayName = contact ? `${scrambleFirst(contact.first_name) ?? ""} ${scrambleLast(contact.last_name) ?? ""}`.trim() : "";
  const displayAddress = contact?.address ? scrambleAddress(contact.address) : "";
  const displayCity = contact?.city ? scrambleCity(contact.city) : "";
  const fullDisplayAddress = [displayAddress, displayCity, contact?.state, contact?.postal_code].filter(Boolean).join(", ");


  const jobStartMs = job.scheduled_for ? new Date(job.scheduled_for).getTime() : null;
  const jobTz = getJobTimeZone(job);
  const isActive = jobStartMs ? jobStartMs <= now : true;
  const priorAllDone = (pos: number) => progress.filter((p: any) => p.position < pos).every((p: any) => p.completed);
  const isWorker = !!me && !me.isAdmin;

  return (
    <AppShell>
      <Link to="/jobs" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="grid grid-cols-1 gap-4 sm:flex sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="truncate font-display text-2xl font-bold">
                  {displayName || "Client"}
                </h1>
                <p className="text-sm text-muted-foreground">{job.job_type?.name}</p>
              </div>
              {job.price_cents && (
                <div className="text-left sm:text-right">
                  <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                    <div className="flex flex-col items-start sm:items-end">
                      <div className="font-display text-2xl font-bold text-brand-green">
                        ${Math.round(job.price_cents / 100).toLocaleString()}
                      </div>
                      <span className="mt-0.5 inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {job.currency}
                      </span>
                    </div>
                    {calculateWorkerPayCents(job.price_cents) > 0 && (
                      <div className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-green/10 px-2 py-1 text-xs font-semibold text-brand-green">
                        <Wallet className="h-3.5 w-3.5 shrink-0" />
                        Your pay {formatWorkerPay(job.price_cents)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-2 text-sm leading-relaxed">
              {contact?.address && (
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-foreground">Location: </span>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(fullDisplayAddress)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-muted-foreground hover:text-brand-green"
                  >
                    {fullDisplayAddress}
                  </a>
                </div>
              )}
              {(job as any).service_details && (
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-foreground">Service: </span>
                  <span className="font-medium text-brand-green">{job.job_type?.name}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="font-medium text-muted-foreground">{(job as any).service_details}</span>
                </div>
              )}
              {(job as any).is_two_storey !== null && (job as any).is_two_storey !== undefined && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-foreground">2-storey building:</span>
                  {(job as any).is_two_storey ? (
                    <Check className="h-4 w-4 text-brand-green" strokeWidth={3} />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground" strokeWidth={3} />
                  )}
                </div>
              )}
            </div>

            {job.notes && (
              <div className="mt-6 rounded-lg border border-border bg-secondary/40 p-3">
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-foreground">Notes</div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{job.notes}</p>
              </div>
            )}

            {(contact?.phone || contact?.email) && (
              <details className="group mt-6">

                <summary className="flex cursor-pointer items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground list-none [&::-webkit-details-marker]:hidden">
                  Extra contact details
                  <span className="transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {contact?.phone && (() => {
                    const p = scramblePhone(contact.phone);
                    return (
                      <a href={`tel:${p}`} className="flex items-center gap-1.5 hover:text-brand-green">
                        <Phone className="h-3.5 w-3.5" /> {p}
                      </a>
                    );
                  })()}
                  {contact?.email && (() => {
                    const e = scrambleEmail(contact.email);
                    return (
                      <a href={`mailto:${e}`} className="flex items-center gap-1.5 hover:text-brand-green">
                        <Mail className="h-3.5 w-3.5" /> {e}
                      </a>
                    );
                  })()}
                </div>
              </details>
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
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <div>
                  <div className="font-semibold text-warning">Job not active yet</div>
                  <div className="text-warning/80">
                    Starts {formatJobDateTime(new Date(jobStartMs), jobTz)} · in {formatDistanceToNow(new Date(jobStartMs))}. You can review the details now — tasks unlock at the appointment time.
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
                  disabled={job.status === "completed" || !isActive || (toggle.isPending && toggle.variables?.progressId === p.id) || (!p.completed && !priorAllDone(p.position))}
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

      {(() => {
        const allDone = total > 0 && done === total;
        const remaining = total - done;
        const isCompleted = job.status === "completed";
        const showDone = total > 0 && !isCompleted;
        return (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] animate-fade-in">
            <div className="mx-auto max-w-md">
              {showDone && allDone && isWorker && calculateWorkerPayCents(job.price_cents) > 0 && (
                <div className="pointer-events-auto mb-2 text-center text-sm font-medium text-brand-green">
                  Complete this job to earn {formatWorkerPay(job.price_cents)}
                </div>
              )}
              <div className="pointer-events-auto flex items-stretch gap-2">
                {!isCompleted && (
                  <button
                    onClick={() => setMsgOpen(true)}
                    className="flex h-auto shrink-0 items-center justify-center gap-2 rounded-2xl bg-card border border-border px-4 text-sm font-semibold shadow-xl transition-all hover:-translate-y-0.5 active:scale-95"
                    aria-label="Messages"
                  >
                    <MessageSquare className="h-5 w-5 text-brand-green" />
                  </button>
                )}
                {isCompleted ? (
                  <div className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-green py-4 text-base font-semibold text-white shadow-2xl shadow-brand-green/40">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="truncate">Job completed</span>
                  </div>
                ) : showDone ? (
                  <button
                    onClick={() => allDone && markDone.mutate()}
                    disabled={!allDone || markDone.isPending}
                    aria-disabled={!allDone}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold shadow-2xl transition-all duration-200 ease-out disabled:cursor-not-allowed",
                      allDone
                        ? "bg-brand-green text-white shadow-brand-green/40 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-6px_rgba(74,163,74,0.45)] active:scale-[0.97] disabled:opacity-70"
                        : "bg-muted text-muted-foreground shadow-black/10",
                    )}
                  >
                    {allDone ? <CheckCircle2 className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                    <span className="truncate">
                      {markDone.isPending
                        ? "Saving…"
                        : allDone
                        ? "Mark job as done"
                        : `${remaining} more ${remaining === 1 ? "task" : "tasks"}`}
                    </span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })()}



      {msgOpen && <MessagesDialog jobId={job.id} currentUserId={me?.userId} onClose={() => setMsgOpen(false)} />}


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
          {isPayment && <DollarSign className="h-4 w-4 text-brand-green" />}
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
          completed={!!item.completed}
          onClose={() => setNoteOpen(false)}
          onSave={(note) => {
            onToggle(true, note);
            setNoteOpen(false);
          }}
          onUnmark={() => {
            onToggle(false);
            setNoteOpen(false);
          }}
        />
      )}
    </>
  );
}

function NoteDialog({ title, initial, completed, onClose, onSave, onUnmark }: { title: string; initial: string; completed: boolean; onClose: () => void; onSave: (note: string) => void; onUnmark: () => void }) {
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
        <div className="mt-3 flex items-center justify-between gap-2">
          <div>
            {completed && (
              <button onClick={onUnmark} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">
                Unmark
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">
              Cancel
            </button>
            <button
              onClick={() => onSave(value.trim())}
              disabled={!value.trim()}
              className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {completed ? "Update note" : "Save note"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function PhotoUploadDialog({ jobId, progressId, kind, title, onClose }: { jobId: string; progressId: string; kind: "before" | "after"; title: string; onClose: () => void }) {
  const qc = useQueryClient();
  const uploadFn = useServerFn(uploadJobPhoto);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"idle" | "reading" | "uploading" | "processing" | "done">("idle");
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tickRef = useRef<number | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setFileName(file.name);
    setFileSize(file.size);
    setPreviewUrl(URL.createObjectURL(file));
    setStage("reading");
    setProgress(0);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 35));
        };
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] || "");
        };
        reader.readAsDataURL(file);
      });
      setProgress(40);
      setStage("uploading");

      tickRef.current = window.setInterval(() => {
        setProgress((p) => (p < 88 ? p + Math.max(1, Math.round((90 - p) / 12)) : p));
      }, 180);

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      await uploadFn({ data: { jobId, progressId, kind, fileBase64: b64, contentType: file.type || "image/jpeg", ext } });

      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      setStage("processing");
      setProgress(96);
      await new Promise((r) => setTimeout(r, 250));
      setProgress(100);
      setStage("done");
      toast.success("Photo uploaded");
      qc.invalidateQueries({ queryKey: ["job", jobId] });
      setTimeout(onClose, 450);
    } catch (e: any) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      toast.error(e.message ?? "Upload failed");
      setStage("idle");
      setProgress(0);
      setUploading(false);
    }
  }

  const accentBg = kind === "before" ? "bg-brand-yellow" : "bg-brand-green";
  const accentText = kind === "before" ? "text-warning" : "text-white";
  const stageLabel =
    stage === "reading" ? "Reading file" :
    stage === "uploading" ? "Uploading" :
    stage === "processing" ? "Processing" :
    stage === "done" ? "Complete" : "";

  function fmtSize(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={uploading ? undefined : onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className={cn("flex items-center gap-2 px-6 py-3 text-xs font-semibold uppercase tracking-wider", accentBg, accentText)}>
          <Camera className="h-4 w-4" />
          {kind} photo
        </div>
        <div className="p-6">
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

          {!uploading && stage === "idle" && (
            <>
              <button
                onClick={() => inputRef.current?.click()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-medium text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.97]"
              >
                <Camera className="h-5 w-5" />
                Take / Choose photo
              </button>
              <button onClick={onClose} className="mt-2 w-full rounded-xl py-2 text-sm text-muted-foreground transition-all duration-200 ease-out hover:bg-secondary active:scale-[0.98]">
                Cancel
              </button>
            </>
          )}

          {(uploading || stage === "done") && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-secondary" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{fileName}</div>
                  <div className="text-xs text-muted-foreground">{fmtSize(fileSize)}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-lg font-bold tabular-nums">{progress}%</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{stageLabel}</div>
                </div>
              </div>

              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-300 ease-out",
                    stage === "done" ? "bg-brand-green" : accentBg,
                  )}
                  style={{ width: `${progress}%` }}
                />
                {stage !== "done" && progress > 0 && (
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 animate-photo-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent"
                    style={{ width: `${progress}%` }}
                  />
                )}
              </div>

              <div className="flex items-center justify-between text-xs">
                {stage === "done" ? (
                  <span className="flex items-center gap-1 font-medium text-brand-green">
                    <Check className="h-3.5 w-3.5" /> Upload complete
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                    {stageLabel}…
                  </span>
                )}
                <div className="text-muted-foreground">Keep this window open</div>
              </div>
            </div>
          )}
        </div>
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
                p.kind === "before" ? "bg-brand-yellow text-warning" : "bg-brand-green text-white",
              )}>{p.kind}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

