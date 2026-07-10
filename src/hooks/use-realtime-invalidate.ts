import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRealtimeInvalidate(tables: string[], queryKeys: string[][]) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel(`rt-${tables.join("-")}-${Math.random().toString(36).slice(2, 8)}`);
    for (const table of tables) {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        () => {
          for (const key of queryKeys) qc.invalidateQueries({ queryKey: key });
        }
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(","), JSON.stringify(queryKeys)]);
}
