import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listContacts } from "@/lib/admin.functions";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/contacts")({
  component: ContactsPage,
});

function ContactsPage() {
  const fn = useServerFn(listContacts);
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => fn() });
  const [q, setQ] = useState("");
  const filtered = contacts.filter((c: any) => {
    const s = q.toLowerCase();
    return !s || [c.first_name, c.last_name, c.email, c.phone, c.address].some((f) => (f ?? "").toLowerCase().includes(s));
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input placeholder="Search contacts…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm" />
      </div>
      <div className="rounded-2xl border border-border bg-card">
        <ul className="divide-y divide-border">
          {filtered.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">No contacts yet. They sync in via HighLevel webhook.</li>}
          {filtered.map((c: any) => (
            <li key={c.id} className="p-4">
              <div className="font-medium">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</div>
              <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                {c.email && <div>{c.email}</div>}
                {c.phone && <div>{c.phone}</div>}
                {c.address && <div>{[c.address, c.city].filter(Boolean).join(", ")}</div>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
