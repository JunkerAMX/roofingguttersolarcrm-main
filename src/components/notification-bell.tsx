import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { listNotifications, markNotificationsRead } from "@/lib/messaging.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function NotificationBell({ userId }: { userId?: string }) {
  const listFn = useServerFn(listNotifications);
  const markFn = useServerFn(markNotificationsRead);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function openNotification(n: any) {
    if (!n.read_at) mark.mutate({ ids: [n.id] });
    setOpen(false);
    const raw = (n.link as string | undefined) ?? "/jobs";
    const [path, qs] = raw.split("?");
    const search: Record<string, string> = {};
    if (qs) for (const part of qs.split("&")) {
      const [k, v] = part.split("=");
      if (k) search[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
    }
    const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
    if (jobMatch) {
      navigate({ to: "/jobs/$jobId", params: { jobId: jobMatch[1] }, search: search as any });
    } else {
      navigate({ to: path as any, search: search as any });
    }
  }


  const { data: items = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listFn(),
    enabled: !!userId,
    refetchInterval: 60_000,
  });

  const mark = useMutation({
    mutationFn: (v: { ids?: string[]; all?: boolean }) => markFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`notif-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const unread = items.filter((n: any) => !n.read_at);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-foreground/60 transition-all duration-200 ease-out hover:bg-secondary hover:text-foreground active:scale-[0.92]"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread.length > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>
      {open && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "z-50 overflow-hidden border border-border bg-card shadow-2xl",
              // Mobile: full-width sheet from top
              "fixed inset-x-2 top-16 rounded-2xl",
              // Desktop: dropdown anchored to bell
              "sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 sm:rounded-xl",
            )}
          >
            <div className="flex items-center justify-between border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-brand-green" />
                <div className="text-sm font-semibold">Notifications</div>
                {unread.length > 0 && (
                  <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-[10px] font-bold text-brand-green">
                    {unread.length} new
                  </span>
                )}
              </div>
              {unread.length > 0 && (
                <button
                  onClick={() => mark.mutate({ all: true })}
                  className="text-xs font-medium text-brand-green hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[70vh] overflow-y-auto sm:max-h-96">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-secondary">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="text-sm font-medium">You're all caught up</div>
                  <div className="text-xs text-muted-foreground">New notifications will appear here.</div>
                </div>
              ) : (
                items.map((n: any) => (
                  <Link
                    key={n.id}
                    to={n.link ?? "/jobs"}
                    onClick={() => {
                      if (!n.read_at) mark.mutate({ ids: [n.id] });
                      setOpen(false);
                    }}
                    className={cn(
                      "block border-b border-border px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-secondary/50 active:bg-secondary",
                      !n.read_at && "bg-brand-lime/10",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {!n.read_at ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-green" />
                      ) : (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-transparent" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{n.title}</div>
                        {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
                        <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

