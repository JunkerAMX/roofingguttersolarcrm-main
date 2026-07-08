import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listTemplatesWithItems, saveChecklistItem, deleteChecklistItem } from "@/lib/admin.functions";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/checklists")({
  component: ChecklistsPage,
});

const INPUT_TYPES = [
  { value: "checkbox", label: "Simple checkbox" },
  { value: "photo_before", label: "Before photo upload" },
  { value: "photo_after", label: "After photo upload" },
  { value: "payment_trigger", label: "Trigger payment SMS" },
  { value: "note", label: "Note field" },
] as const;

function ChecklistsPage() {
  const listFn = useServerFn(listTemplatesWithItems);
  const saveFn = useServerFn(saveChecklistItem);
  const delFn = useServerFn(deleteChecklistItem);
  const qc = useQueryClient();
  const { data: tpls = [] } = useQuery({ queryKey: ["templates"], queryFn: () => listFn() });
  const [editingId, setEditingId] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (v: any) => saveFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      setEditingId(null);
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Deleted"); },
  });

  return (
    <div className="space-y-6">
      {tpls.map((t: any) => (
        <div key={t.id} className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">{t.name}</h2>
              <p className="text-xs text-muted-foreground">{t.job_type?.name}</p>
            </div>
            <button
              onClick={() => save.mutate({
                template_id: t.id,
                title: "New item",
                input_type: "checkbox",
                position: (t.items[t.items.length - 1]?.position ?? 0) + 1,
              })}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Add item
            </button>
          </div>
          <ul className="space-y-2">
            {t.items.map((item: any) => (
              <li key={item.id} className="rounded-xl border border-border bg-background p-3">
                {editingId === item.id ? (
                  <ItemEditor
                    item={item}
                    onCancel={() => setEditingId(null)}
                    onSave={(v) => save.mutate({ ...item, ...v })}
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="w-8 text-center text-xs font-semibold text-muted-foreground">{item.position}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{item.title}</div>
                      <div className="text-xs text-muted-foreground">{INPUT_TYPES.find(x => x.value === item.input_type)?.label}</div>
                    </div>
                    <button onClick={() => setEditingId(item.id)} className="rounded-lg px-3 py-1 text-sm hover:bg-secondary">Edit</button>
                    <button onClick={() => confirm("Delete?") && del.mutate(item.id)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ItemEditor({ item, onCancel, onSave }: { item: any; onCancel: () => void; onSave: (v: any) => void }) {
  const [title, setTitle] = useState(item.title);
  const [inputType, setInputType] = useState(item.input_type);
  const [position, setPosition] = useState(item.position);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_200px_80px]">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        <select value={inputType} onChange={(e) => setInputType(e.target.value as any)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
          {INPUT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input type="number" value={position} onChange={(e) => setPosition(Number(e.target.value))} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ title, input_type: inputType, position })} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Save</button>
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm hover:bg-secondary">Cancel</button>
      </div>
    </div>
  );
}
