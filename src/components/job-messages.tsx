import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Send, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { listJobMessages, sendJobMessage } from "@/lib/messaging.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function JobMessages({ jobId, currentUserId }: { jobId: string; currentUserId?: string }) {
  const listFn = useServerFn(listJobMessages);
  const sendFn = useServerFn(sendJobMessage);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: msgs = [] } = useQuery({
    queryKey: ["jobMessages", jobId],
    queryFn: () => listFn({ data: { jobId } }),
  });

  const send = useMutation({
    mutationFn: (body: string) => sendFn({ data: { jobId, body } }),
    onMutate: async (body: string) => {
      setText("");
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

  useEffect(() => {
    const ch = supabase
      .channel(`job-msg-${jobId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_messages", filter: `job_id=eq.${jobId}` }, () => {
        qc.invalidateQueries({ queryKey: ["jobMessages", jobId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [jobId, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || send.isPending) return;
    send.mutate(body);
  }

  return (
    <div className="flex flex-col bg-card overflow-hidden">
      <div className="flex max-h-96 min-h-[12rem] flex-col gap-2 overflow-y-auto p-4">
        {msgs.length === 0 ? (
          <div className="my-auto text-center text-xs text-muted-foreground">No messages yet. Say hi 👋</div>
        ) : (
          msgs.map((m: any) => {
            const mine = m.sender_id === currentUserId;
            const name = m.sender?.full_name || m.sender?.email || "User";
            return (
              <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                  mine ? "bg-brand-green text-white" : "bg-secondary text-foreground",
                )}>
                  {!mine && <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">{name}</div>}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {format(new Date(m.created_at), "d MMM · h:mm a")}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(e as any); }
          }}
          placeholder="Type a message…"
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
