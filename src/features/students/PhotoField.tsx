import { useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { initials } from "./logic";

export function PhotoField({
  value,
  studentCode,
  name,
  onChange,
}: {
  value: string | null;
  studentCode: string;
  name: string;
  onChange: (path: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function pick() {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"] }],
    });
    const src = typeof picked === "string" ? picked : null;
    if (!src) return;
    try {
      setBusy(true);
      const stored = await invoke<string>("save_student_photo", {
        srcPath: src,
        studentCode: studentCode || "new",
      });
      if (value) await invoke("delete_student_photo", { path: value }).catch(() => {});
      onChange(stored);
    } catch (e) {
      toast.error(typeof e === "string" ? e : "Could not save the photo.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (value) await invoke("delete_student_photo", { path: value }).catch(() => {});
    onChange(null);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface-muted text-lg font-semibold text-text-muted">
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : value ? (
          <img src={convertFileSrc(value)} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(name || "?")
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={pick} disabled={busy}>
          <ImagePlus className="h-4 w-4" />
          {value ? "Change photo" : "Add photo"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={busy}>
            <Trash2 className="h-4 w-4 text-danger" />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
