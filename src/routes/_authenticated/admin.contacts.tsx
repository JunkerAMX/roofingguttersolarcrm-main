import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ChangeEvent, type ComponentProps } from "react";
import { listContacts, deleteContact, saveContact } from "@/lib/admin.functions";
import { useScramble } from "@/hooks/use-scramble";
import { Edit3, Search, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/contacts")({
  component: ContactsPage,
});

function ContactsPage() {
  const fn = useServerFn(listContacts);
  const del = useServerFn(deleteContact);
  const qc = useQueryClient();
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => fn() });
  const { scrambleFirst, scrambleLast, scrambleAddress, scrambleCity, scramblePhone, scrambleEmail } = useScramble();
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
              <div className="flex shrink-0 items-center gap-1">
                <EditContactDialog contact={c} />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 ease-out hover:bg-destructive/10 hover:text-destructive active:scale-[0.92]" aria-label="Delete contact">
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
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EditContactDialog({ contact }: { contact: any }) {
  const save = useServerFn(saveContact);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: contact.first_name ?? "",
    last_name: contact.last_name ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    address: contact.address ?? "",
    city: contact.city ?? "",
    state: contact.state ?? "",
    postal_code: contact.postal_code ?? "",
    notes: contact.notes ?? "",
  });
  const mutation = useMutation({
    mutationFn: () => save({ data: { id: contact.id, ...form } }),
    onSuccess: () => {
      toast.success("Contact updated");
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["allJobs"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update contact"),
  });

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 ease-out hover:bg-secondary hover:text-foreground active:scale-[0.92]" aria-label="Edit contact">
          <Edit3 className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit contact</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" value={form.first_name} onChange={set("first_name")} />
          <Field label="Last name" value={form.last_name} onChange={set("last_name")} />
          <Field label="Email" type="email" value={form.email} onChange={set("email")} />
          <Field label="Phone" value={form.phone} onChange={set("phone")} />
          <Field label="Address" value={form.address} onChange={set("address")} className="sm:col-span-2" />
          <Field label="City" value={form.city} onChange={set("city")} />
          <Field label="State" value={form.state} onChange={set("state")} />
          <Field label="Postcode" value={form.postal_code} onChange={set("postal_code")} />
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">Notes</span>
            <Textarea value={form.notes} onChange={set("notes")} rows={4} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} type="button">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} type="button">
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className, ...props }: ComponentProps<typeof Input> & { label: string }) {
  return (
    <label className={`grid gap-1 text-sm ${className ?? ""}`}>
      <span className="font-medium">{label}</span>
      <Input {...props} />
    </label>
  );
}
