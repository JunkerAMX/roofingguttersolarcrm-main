import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listContacts, deleteContact } from "@/lib/admin.functions";
import { Search, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/contacts")({
  component: ContactsPage,
});

function ContactsPage() {
  const fn = useServerFn(listContacts);
  const del = useServerFn(deleteContact);
  const qc = useQueryClient();
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => fn() });
  const [q, setQ] = useState("");
  const filtered = contacts.filter((c: any) => {
    const s = q.toLowerCase();
    return !s || [c.first_name, c.last_name, c.email, c.phone, c.address, c.highlevel_contact_id].some((f) => (f ?? "").toLowerCase().includes(s));
  });

  const handleDelete = async (id: string) => {
    try {
      await del({ data: { id } });
      toast.success("Contact deleted");
      qc.invalidateQueries({ queryKey: ["contacts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    }
  };

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
            <li key={c.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.highlevel_contact_id || "—"}</div>
                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                  {c.email && <div>{c.email}</div>}
                  {c.phone && <div>{c.phone}</div>}
                  {c.address && <div>{[c.address, c.city].filter(Boolean).join(", ")}</div>}
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete contact">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this contact?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the contact. Any linked jobs will lose their contact reference.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(c.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
