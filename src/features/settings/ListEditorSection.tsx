import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { LoadingBlock, ErrorBlock, EmptyRow } from "@/components/ui/State";
import {
  useAddNamed,
  useDeleteNamed,
  useNamedList,
  useRenameNamed,
  useReorderNamed,
  type ListTable,
  type NamedRow,
} from "./api";

export function ListEditorSection({
  table,
  title,
  description,
  singular,
}: {
  table: ListTable;
  title: string;
  description: string;
  singular: string;
}) {
  const { data: rows, isLoading, error } = useNamedList(table);
  const addNamed = useAddNamed(table);
  const renameNamed = useRenameNamed(table);
  const reorder = useReorderNamed(table);
  const deleteNamed = useDeleteNamed(table);

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<NamedRow | null>(null);

  async function add() {
    const name = newName.trim();
    if (!name) return;
    try {
      await addNamed.mutateAsync(name);
      setNewName("");
      toast.success(`${singular[0].toUpperCase()}${singular.slice(1)} added.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add.");
    }
  }

  async function saveRename() {
    if (editId == null) return;
    const name = editValue.trim();
    if (!name) return;
    try {
      await renameNamed.mutateAsync({ id: editId, name });
      setEditId(null);
      toast.success("Renamed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rename.");
    }
  }

  async function move(index: number, dir: -1 | 1) {
    if (!rows) return;
    const a = rows[index];
    const b = rows[index + dir];
    if (!a || !b) return;
    try {
      await reorder.mutateAsync({ a, b });
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-border">
          {isLoading ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorBlock error={error} />
          ) : !rows?.length ? (
            <EmptyRow>Nothing here yet.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row, i) => (
                <li key={row.id} className="flex items-center gap-2 px-3 py-2.5">
                  <span className="w-6 text-center text-xs text-text-muted">{i + 1}</span>
                  {editId === row.id ? (
                    <>
                      <Input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename();
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className="h-8 flex-1"
                      />
                      <Button variant="ghost" size="icon" aria-label="Save" onClick={saveRename}>
                        <Check className="h-4 w-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Cancel" onClick={() => setEditId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-text">{row.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Move down"
                        disabled={i === rows.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Rename"
                        onClick={() => {
                          setEditId(row.id);
                          setEditValue(row.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete"
                        onClick={() => setConfirmDelete(row)}
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={`Add a ${singular}…`}
          />
          <Button onClick={add} loading={addNamed.isPending}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </CardBody>

      <Dialog
        open={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${singular}?`}
        description={
          confirmDelete
            ? `"${confirmDelete.name}" will be removed. This is blocked if records already reference it.`
            : ""
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteNamed.isPending}
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await deleteNamed.mutateAsync(confirmDelete.id);
                  toast.success("Deleted.");
                  setConfirmDelete(null);
                } catch (e) {
                  toast.error(
                    e instanceof Error && /FOREIGN KEY/i.test(e.message)
                      ? `Cannot delete "${confirmDelete.name}" — it is already in use.`
                      : e instanceof Error
                        ? e.message
                        : "Could not delete.",
                  );
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </Card>
  );
}
