import { useRef, useState } from "react";
import { Upload, X, FileSpreadsheet, Download } from "lucide-react";
import { toast } from "sonner";

type Result = { ok: number; errors: number; total: number; log: { row: any; error: string }[] };

export function ImportDialog({
  title,
  templateHeaders,
  templateFile,
  onImport,
  onClose,
  onDone,
}: {
  title: string;
  templateHeaders: string[];
  templateFile: string;
  onImport: (args: { fileBase64: string; fileName: string }) => Promise<Result>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const csv = templateHeaders.join(",") + "\n";
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = templateFile; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res = await onImport({ fileBase64: b64, fileName: file.name });
      setResult(res);
      if (res.ok > 0) {
        toast.success(`${res.ok} registros importados${res.errors ? ` (${res.errors} con error)` : ""}`);
        onDone();
      } else {
        toast.error(`No se importó ningún registro (${res.errors} errores)`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        {!result ? (
          <>
            <div className="mb-4 rounded-md border bg-secondary/30 p-3 text-xs">
              <p className="mb-2 font-medium">Columnas esperadas:</p>
              <p className="font-mono text-[11px] text-muted-foreground break-all">
                {templateHeaders.join(", ")}
              </p>
              <button
                onClick={downloadTemplate}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs font-medium hover:bg-secondary"
              >
                <Download className="h-3.5 w-3.5" /> Descargar plantilla CSV
              </button>
            </div>

            <button
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed border-border p-8 text-sm hover:bg-secondary/30"
            >
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
              {file ? (
                <div className="text-center">
                  <div className="font-medium">{file.name}</div>
                  <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="font-medium">Selecciona un archivo</div>
                  <div className="text-xs text-muted-foreground">XLSX, XLS o CSV</div>
                </div>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary">Cancelar</button>
              <button
                disabled={!file || busy}
                onClick={handleImport}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" /> {busy ? "Importando…" : "Importar"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3 text-center">
              <Stat label="Total" value={result.total} />
              <Stat label="OK" value={result.ok} className="text-success" />
              <Stat label="Errores" value={result.errors} className={result.errors ? "text-destructive" : ""} />
            </div>
            {result.log.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-md border bg-secondary/20 p-2 text-xs">
                <div className="mb-1 font-medium">Primeros errores:</div>
                {result.log.map((l, i) => (
                  <div key={i} className="border-b py-1 last:border-0">
                    <div className="text-destructive">{l.error}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button onClick={onClose} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}
