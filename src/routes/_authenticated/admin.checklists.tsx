import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { listTemplatesWithItems, saveChecklistItem, deleteChecklistItem, reorderChecklistItems } from "@/lib/admin.functions";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  const reorderFn = useServerFn(reorderChecklistItems);
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
  const reorder = useMutation({
    mutationFn: (items: { id: string; position: number }[]) => reorderFn({ data: { items } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {tpls.map((t: any) => (
        <TemplateCard
          key={t.id}
          template={t}
          editingId={editingId}
          setEditingId={setEditingId}
          onAdd={() => save.mutate({
            template_id: t.id,
            title: "New item",
            input_type: "checkbox",
            position: (t.items[t.items.length - 1]?.position ?? 0) + 1,
          })}
          onSave={(v: any) => save.mutate(v)}
          onDelete={(id: string) => del.mutate(id)}
          onReorder={(items) => reorder.mutate(items)}
        />
      ))}
    </div>
  );
}

function TemplateCard({
  template: t,
  editingId,
  setEditingId,
  onAdd,
  onSave,
  onDelete,
  onReorder,
}: {
  template: any;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onAdd: () => void;
  onSave: (v: any) => void;
  onDelete: (id: string) => void;
  onReorder: (items: { id: string; position: number }[]) => void;
}) {
  const [items, setItems] = useState<any[]>(t.items);
  useEffect(() => { setItems(t.items); }, [t.items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex).map((it, idx) => ({ ...it, position: idx + 1 }));
    setItems(next);
    onReorder(next.map((it) => ({ id: it.id, position: it.position })));
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">{t.name}</h2>
          <p className="text-xs text-muted-foreground">{t.job_type?.name} · drag to reorder</p>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" /> Add item
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {items.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                editing={editingId === item.id}
                onEdit={() => setEditingId(item.id)}
                onCancel={() => setEditingId(null)}
                onSave={(v) => onSave({ ...item, ...v })}
                onDelete={() => confirm("Delete?") && onDelete(item.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableItem({
  item, editing, onEdit, onCancel, onSave, onDelete,
}: {
  item: any;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (v: any) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} className="rounded-xl border border-border bg-background p-3">
      {editing ? (
        <ItemEditor item={item} onCancel={onCancel} onSave={onSave} />
      ) : (
        <div className="flex items-center gap-3">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-secondary active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{item.title}</div>
            <div className="text-xs text-muted-foreground">{INPUT_TYPES.find((x) => x.value === item.input_type)?.label}</div>
          </div>
          <button onClick={onEdit} className="rounded-lg px-3 py-1 text-sm transition-all duration-200 ease-out hover:bg-secondary active:scale-[0.95]">Edit</button>
          <button onClick={onDelete} className="rounded-lg p-2 text-destructive transition-all duration-200 ease-out hover:bg-destructive/10 active:scale-[0.92]">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </li>
  );
}

function ItemEditor({ item, onCancel, onSave }: { item: any; onCancel: () => void; onSave: (v: any) => void }) {
  const [title, setTitle] = useState(item.title);
  const [inputType, setInputType] = useState(item.input_type);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        <select value={inputType} onChange={(e) => setInputType(e.target.value as any)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
          {INPUT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ title, input_type: inputType, position: item.position })} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-sm active:scale-[0.97]">Save</button>
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm transition-all duration-200 ease-out hover:bg-secondary active:scale-[0.95]">Cancel</button>
      </div>
    </div>
  );
}
