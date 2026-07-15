import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { format } from "date-fns";
import { listJobMessages, sendJobMessage } from "@/lib/messaging.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TypingUser = { userId: string; name: string; at: number };

export function JobMessages({ jobId, currentUserId, targetMessageId }: { jobId: string; currentUserId?: string; targetMessageId?: string }) {
  const listFn = useServerFn(listJobMessages);
  const sendFn = useServerFn(sendJobMessage);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, TypingUser>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastBroadcastRef = useRef<number>(0);
  const typingTimerRef = useRef<number | null>(null);

  const { data: msgs = [] } = useQuery({
    queryKey: ["jobMessages", jobId],
    queryFn: () => listFn({ data: { jobId } }),
  });

  const send = useMutation({
    mutationFn: (body: string) => sendFn({ data: { jobId, body } }),
    onMutate: async (body: string) => {
      setText("");
      // stop typing when sending
      channelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: currentUserId, typing: false } });
      await qc.cancelQueries({ queryKey: ["jobMessages", jobId] });
      const prev = qc.getQueryData<any[]>(["jobMessages", jobId]) ?? [];
      const optimistic = {
        id: `optimistic-${Date.now()}`,
        job_id: jobId,
        sender_id: currentUserId,
        body,
        created_at: new Date().toISOString(),
        sender: null,
        _optimistic: true,
      };
      qc.setQueryData(["jobMessages", jobId], [...prev, optimistic]);
      return { prev };
    },
    onError: (e: any, _body, ctx) => {
      if (ctx?.prev) qc.setQueryData(["jobMessages", jobId], ctx.prev);
      toast.error(e?.message ?? "Send failed");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["jobMessages", jobId] });
    },
  });

  // Realtime: postgres_changes + typing broadcast on one channel
  useEffect(() => {
    const ch = supabase
      .channel(`job-msg-${jobId}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_messages", filter: `job_id=eq.${jobId}` }, () => {
        qc.invalidateQueries({ queryKey: ["jobMessages", jobId] });
      })
      .on("broadcast", { event: "typing" }, (payload) => {
        const p = payload.payload as { userId: string; name?: string; typing: boolean };
        if (!p?.userId || p.userId === currentUserId) return;
        setTypingUsers((prev) => {
          const next = { ...prev };
          if (p.typing) next[p.userId] = { userId: p.userId, name: p.name || "Someone", at: Date.now() };
          else delete next[p.userId];
          return next;
        });
      })
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
  }, [jobId, qc, currentUserId]);

  // Prune stale typing entries every 2s
  useEffect(() => {
    const t = window.setInterval(() => {
      setTypingUsers((prev) => {
        const cutoff = Date.now() - 4000;
        const next: Record<string, TypingUser> = {};
        for (const [k, v] of Object.entries(prev)) if (v.at >= cutoff) next[k] = v;
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 2000);
    return () => window.clearInterval(t);
  }, []);

  function broadcastTyping() {
    const ch = channelRef.current;
    if (!ch || !currentUserId) return;
    const now = Date.now();
    if (now - lastBroadcastRef.current > 1500) {
      ch.send({ type: "broadcast", event: "typing", payload: { userId: currentUserId, typing: true } });
      lastBroadcastRef.current = now;
    }
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      ch.send({ type: "broadcast", event: "typing", payload: { userId: currentUserId, typing: false } });
      lastBroadcastRef.current = 0;
    }, 2500);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  // Scroll to and highlight target message
  useEffect(() => {
    if (!targetMessageId || msgs.length === 0) return;
    const el = msgRefs.current[targetMessageId];
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(targetMessageId);
      const t = window.setTimeout(() => setHighlightId(null), 1600);
      return () => window.clearTimeout(t);
    });
    return () => cancelAnimationFrame(raf);
  }, [targetMessageId, msgs.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || send.isPending) return;
    send.mutate(body);
  }

  const typingList = Object.values(typingUsers);

  return (
    <div className="flex flex-col bg-card overflow-hidden">
      <div className="border-b border-border bg-secondary/40 px-3 py-2 text-center text-xs text-muted-foreground">
        This chat is with your admin team, not the client.
      </div>
      <div className="flex max-h-96 min-h-[12rem] flex-col gap-2 overflow-y-auto p-4">
        {msgs.length === 0 ? (
          <div className="my-auto text-center text-xs text-muted-foreground">
            No admin messages yet. Reach out for help here 👋
          </div>
        ) : (
          msgs.map((m: any) => {
            const mine = m.sender_id === currentUserId;
            const name = mine ? "You" : (m.sender?.full_name || m.sender?.email || "User");
            const isTarget = highlightId === m.id;
            return (
              <div
                key={m.id}
                ref={(el) => { msgRefs.current[m.id] = el; }}
                className={cn(
                  "flex flex-col rounded-2xl transition-all duration-500",
                  mine ? "items-end" : "items-start",
                  isTarget && "bg-brand-lime/25 ring-2 ring-brand-green shadow-md",
                )}
              >
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                  mine ? "bg-brand-green text-white" : "bg-secondary text-foreground",
                )}>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">{name}</div>
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {format(new Date(m.created_at), "d MMM · h:mm a")}
                </div>
              </div>
            );
          })
        )}
        {typingList.length > 0 && (
          <div className="flex items-center gap-2 pl-1 pt-1 text-xs text-muted-foreground">
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-green [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-green [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-green" />
            </div>
            <span>{typingList.length === 1 ? `${typingList[0].name} is typing…` : `${typingList.length} people are typing…`}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) broadcastTyping(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(e as any); }
          }}
          placeholder="Message admin team…"
          rows={1}
          className="min-h-[2.5rem] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40"
        />
        <button
          type="submit"
          disabled={!text.trim() || send.isPending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green text-white transition-all hover:bg-brand-green/90 active:scale-[0.95] disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
