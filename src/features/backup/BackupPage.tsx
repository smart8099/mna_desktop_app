import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Database,
  Download,
  HardDriveDownload,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { LoadingBlock } from "@/components/ui/State";
import { formatBytes } from "@/lib/format";

interface DbInfo {
  path: string;
  size_bytes: number;
  schema_version: number;
}
interface DbFileMeta {
  app: string;
  schema_version: number;
  created_at: string | null;
}
interface BackupEntry {
  name: string;
  path: string;
  size_bytes: number;
  modified: string | null;
}

function defaultBackupName() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `mna-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.db`;
}

export function BackupPage() {
  const info = useQuery({
    queryKey: ["db-info"],
    queryFn: () => invoke<DbInfo>("database_info"),
  });
  const backups = useQuery({
    queryKey: ["backups"],
    queryFn: () => invoke<BackupEntry[]>("list_backups"),
  });

  const [downloading, setDownloading] = useState(false);
  const [pending, setPending] = useState<{ path: string; meta: DbFileMeta } | null>(null);
  const [staging, setStaging] = useState(false);
  const [staged, setStaged] = useState(false);

  async function download() {
    try {
      const dest = await save({
        defaultPath: defaultBackupName(),
        filters: [{ name: "SQLite database", extensions: ["db"] }],
      });
      if (!dest) return;
      setDownloading(true);
      const bytes = await invoke<number>("backup_database", { destPath: dest });
      toast.success(`Database saved (${formatBytes(bytes)}). Upload it to Google Drive to keep it safe.`);
    } catch (e) {
      toast.error(typeof e === "string" ? e : "Could not save the backup.");
    } finally {
      setDownloading(false);
    }
  }

  async function chooseRestoreFile() {
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "SQLite database", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      const path = typeof picked === "string" ? picked : null;
      if (!path) return;
      const meta = await invoke<DbFileMeta>("validate_db_file", { path });
      setPending({ path, meta });
    } catch (e) {
      toast.error(typeof e === "string" ? e : "That file could not be used.");
    }
  }

  async function confirmRestore() {
    if (!pending) return;
    try {
      setStaging(true);
      await invoke<string>("restore_database", { srcPath: pending.path });
      setPending(null);
      setStaged(true);
    } catch (e) {
      toast.error(typeof e === "string" ? e : "Restore failed.");
    } finally {
      setStaging(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text">Backup &amp; Recovery</h2>
        <p className="mt-1 text-sm text-text-muted">
          Everything the app stores lives in one file. Download it regularly and keep a copy on
          Google Drive — if this computer is lost, upload that file on the new one and carry on.
        </p>
      </div>

      <Card>
        <CardHeader title="This database" />
        <CardBody>
          {info.isLoading ? (
            <LoadingBlock />
          ) : info.error ? (
            <p className="text-sm text-danger">Could not read database info.</p>
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-text-muted">Size</dt>
                <dd className="mt-0.5 font-medium text-text">
                  {formatBytes(info.data!.size_bytes)}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Format version</dt>
                <dd className="mt-0.5 font-medium text-text">v{info.data!.schema_version}</dd>
              </div>
              <div className="min-w-0 sm:col-span-1">
                <dt className="text-text-muted">Location</dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-text" title={info.data!.path}>
                  {info.data!.path}
                </dd>
              </div>
            </dl>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Download a backup"
          description="Saves a complete copy of the database to a file you choose."
        />
        <CardBody className="flex flex-wrap items-center gap-3">
          <Button onClick={download} loading={downloading}>
            <Download className="h-4 w-4" />
            Download database file
          </Button>
          <span className="text-sm text-text-muted">
            Then move it into your Google Drive folder.
          </span>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Restore from a backup"
          description="Replaces all current data with the contents of a database file."
        />
        <CardBody className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This overwrites everything in the app. A snapshot of the current database is saved
              automatically first, so a mistaken restore can be undone.
            </span>
          </div>
          <Button variant="outline" onClick={chooseRestoreFile}>
            <Upload className="h-4 w-4" />
            Choose a database file…
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Automatic backups"
          description="A timestamped copy is saved to the app folder each time you close the app. The last 10 are kept."
        />
        <CardBody className="p-0">
          {backups.isLoading ? (
            <LoadingBlock />
          ) : !backups.data?.length ? (
            <p className="px-5 py-6 text-sm text-text-muted">No automatic backups yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {backups.data.map((b) => (
                <li key={b.path} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <HardDriveDownload className="h-4 w-4 shrink-0 text-text-muted" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-text" title={b.name}>
                    {b.name}
                  </span>
                  <span className="shrink-0 text-text-muted">{b.modified}</span>
                  <span className="shrink-0 tabular-nums text-text-muted">
                    {formatBytes(b.size_bytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={pending != null}
        onClose={() => setPending(null)}
        title="Restore this database?"
        description="The current data will be replaced. This cannot be undone from inside the app (but a snapshot is kept)."
        footer={
          <>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmRestore} loading={staging}>
              <Database className="h-4 w-4" />
              Replace &amp; restore
            </Button>
          </>
        }
      >
        {pending && (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">File</dt>
              <dd className="truncate font-mono text-xs text-text" title={pending.path}>
                {pending.path.split(/[/\\]/).pop()}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Format version</dt>
              <dd className="text-text">v{pending.meta.schema_version}</dd>
            </div>
            {pending.meta.created_at && (
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Originally created</dt>
                <dd className="text-text">{pending.meta.created_at}</dd>
              </div>
            )}
          </dl>
        )}
      </Dialog>

      <Dialog
        open={staged}
        onClose={() => setStaged(false)}
        title="Restart to finish"
        description="The restored database is ready. The app needs to restart to load it."
        footer={
          <Button onClick={() => invoke("relaunch")}>
            <RefreshCw className="h-4 w-4" />
            Restart now
          </Button>
        }
      />
    </div>
  );
}
