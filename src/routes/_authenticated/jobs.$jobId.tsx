import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { AppShell } from "@/components/app-shell";
import { getJob, toggleChecklistItem, uploadJobPhoto, getPhotoUrl, markJobDone } from "@/lib/jobs.functions";
import { ArrowLeft, MapPin, Phone, Mail, DollarSign, Camera, Check, Lock, ImageIcon, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  component: JobDetail,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

function JobDetail() {
  const { jobId } = useParams({ from: "/_authenticated/jobs/$jobId" });
  const qc = useQueryClient();
  const fn = useServerFn(getJob);
  const toggleFn = useServerFn(toggleChecklistItem);
  const markDoneFn = useServerFn(markJobDone);
  const { data, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fn({ data: { jobId } }),
  });

  const toggle = useMutation({
    mutationFn: (v: { progressId: string; completed: boolean }) => toggleFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: any) => toast.error(e.message),
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

  if (isLoading || !data) return <AppShell><div className="animate-pulse space-y-4"><div className="h-8 w-40 rounded bg-secondary" /><div className="h-64 rounded-2xl bg-secondary" /></div></AppShell>;

  const { job, progress } = data;
  const done = progress.filter((p: any) => p.completed).length;
  const total = progress.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const contact = job.contact;
  const priorAllDone = (pos: number) => progress.filter((p: any) => p.position < pos).every((p: any) => p.completed);

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
                  <div className="font-display text-2xl font-bold text-brand-green">
                    ${(job.price_cents / 100).toFixed(2)}
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
              <div className="h-full bg-gradient-to-r from-brand-green to-brand-lime transition-all" style={{ width: `${pct}%` }} />
            </div>
            <ul className="space-y-2">
              {progress.map((p: any) => (
                <ChecklistRow
                  key={p.id}
                  item={p}
                  jobId={jobId}
                  disabled={p.input_type === "payment_trigger" && !priorAllDone(p.position)}
                  onToggle={(completed) => toggle.mutate({ progressId: p.id, completed })}
                />
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <PhotoGallery jobId={jobId} photos={data.photos} />
        </div>
      </div>
    </AppShell>
  );
}

function ChecklistRow({ item, jobId, disabled, onToggle }: { item: any; jobId: string; disabled: boolean; onToggle: (c: boolean) => void }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const isPhoto = item.input_type === "photo_before" || item.input_type === "photo_after";
  const isPayment = item.input_type === "payment_trigger";

  const handleClick = () => {
    if (disabled) return;
    if (isPhoto && !item.completed) {
      setUploadOpen(true);
      return;
    }
    onToggle(!item.completed);
  };

  return (
    <>
      <li>
        <button
          onClick={handleClick}
          disabled={disabled}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all",
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
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
              item.completed ? "border-brand-green bg-brand-green text-white" : "border-border",
            )}
          >
            {item.completed && <Check className="h-4 w-4" />}
            {!item.completed && disabled && <Lock className="h-3 w-3 text-muted-foreground" />}
          </span>
          <span className="flex-1 text-sm font-medium">{item.title}</span>
          {isPhoto && <Camera className="h-4 w-4 text-brand-green" />}
          {isPayment && <DollarSign className="h-4 w-4 text-brand-yellow" />}
        </button>
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
    </>
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
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-medium text-primary-foreground disabled:opacity-60"
        >
          <Camera className="h-5 w-5" />
          {uploading ? "Uploading…" : "Take / Choose photo"}
        </button>
        <button onClick={onClose} className="mt-2 w-full rounded-xl py-2 text-sm text-muted-foreground hover:bg-secondary">
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
