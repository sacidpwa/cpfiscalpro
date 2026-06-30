import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { previewSuaImport, importSuaArchivos } from "@/lib/sua.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { TIPO_MOV_LABEL, TIPO_INCAP_LABEL } from "@/lib/sua/import-parser";

export const Route = createFileRoute("/_authenticated/app/sua/importar")({
  component: ImportarSua,
});

async function fileToText(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

type Slot = { key: string; label: string; hint: string };
const SLOTS: Slot[] = [
  { key: "aseg", label: "Aseg.TXT — Asegurados", hint: "Datos laborales (NSS, RFC, CURP, SBC, fecha alta)" },
  { key: "afil", label: "Afil.TXT — Afiliación", hint: "Fecha de nacimiento, sexo, ocupación, entidad" },
  { key: "mov", label: "Movt.TXT — Movimientos", hint: "Altas, bajas, modificaciones, ausencias, incapacidades" },
  { key: "incap", label: "Incap.TXT — Incapacidades", hint: "Detalle de folios, días subsidiados, tipo" },
  { key: "cred", label: "Cred.TXT — Créditos Infonavit", hint: "Número de crédito, tipo descuento, factor" },
];

function ImportarSua() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const previewFn = useServerFn(previewSuaImport);
  const importFn = useServerFn(importSuaArchivos);

  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [patron, setPatron] = useState({
    razonSocial: "",
    rfcPatron: "",
    actividadEconomica: "",
    domicilio: "",
    cp: "",
    municipio: "",
    estado: "",
    telefono: "",
    representanteLegal: "",
    delegacion: "",
    subdelegacion: "",
    subdelegacionClave: "",
    areaGeografica: "A",
    claseRiesgo: "",
    fraccion: "",
    primaRiesgo: "",
  });
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  function fillHelix() {
    setPatron({
      razonSocial: "HELIX PROTEINAS SA DE CV",
      rfcPatron: "HPR221205856",
      actividadEconomica: "OTROS INTERMEDIARIOS DE COMERCIO AL POR",
      domicilio: "DOROTEO ARANGO 23 SANTA MARIA TOTOLTEPEC",
      cp: "50245",
      municipio: "TOLUCA",
      estado: "ESTADO DE MEXICO",
      telefono: "7221014477",
      representanteLegal: "JOSE JUAN LABRA ROSSANO",
      delegacion: "EDO. MEXICO PONIENTE",
      subdelegacion: "TOLUCA",
      subdelegacionClave: "1601",
      areaGeografica: "A",
      claseRiesgo: "III",
      fraccion: "613",
      primaRiesgo: "0.98472",
    });
    toast.success("Datos de Helix Proteínas precargados");
  }

  async function readTexts() {
    const out: any = {};
    for (const s of SLOTS) {
      const f = files[s.key];
      if (f) out[`${s.key}Text`] = await fileToText(f);
    }
    return out;
  }

  function patronPayload() {
    const p = { ...patron, primaRiesgo: patron.primaRiesgo ? Number(patron.primaRiesgo) : undefined };
    Object.keys(p).forEach((k) => {
      const v = (p as any)[k];
      if (v === "" || v == null) delete (p as any)[k];
    });
    return p;
  }

  async function doPreview() {
    const hasAny = SLOTS.some((s) => files[s.key]);
    if (!hasAny) { toast.error("Sube al menos un archivo"); return; }
    setLoading(true);
    try {
      const t = await readTexts();
      const res = await previewFn({ data: { organizationId: org.id, ...t, ...patronPayload() } });
      setPreview(res);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  async function doImport() {
    if (!preview) { toast.error("Previsualiza primero"); return; }
    const total = (preview.asegs?.length ?? 0) + (preview.movs?.length ?? 0) + (preview.incaps?.length ?? 0) + (preview.afils?.length ?? 0) + (preview.creds?.length ?? 0);
    if (!confirm(`Importar ${total} registros a "${org.razon_social}"?\nEmpleados existentes serán ACTUALIZADOS con los datos del SUA.`)) return;
    setLoading(true);
    const t = toast.loading("Importando…");
    try {
      const text = await readTexts();
      const res: any = await importFn({ data: { organizationId: org.id, ...text, ...patronPayload() } });
      toast.success(
        `✓ Patrones: ${res.patrones} · Empleados: ${res.empleados_creados} nuevos / ${res.empleados_actualizados} actualizados · Afiliación: ${res.afiliacion_aplicados} · Movs: ${res.movimientos_creados} · Incap: ${res.incapacidades_creadas} · Créditos: ${res.creditos_aplicados}`,
        { id: t, duration: 10000 },
      );
      qc.invalidateQueries({ queryKey: ["sua-patrones", org.id] });
      qc.invalidateQueries({ queryKey: ["sua-movs", org.id] });
      qc.invalidateQueries({ queryKey: ["employees", org.id] });
      setPreview(null);
      setFiles({});
    } catch (e: any) { toast.error(e.message, { id: t }); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Importar respaldo completo del SUA</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Sube uno o varios de los archivos que exporta el SUA. Se procesarán hacia <strong>{org.razon_social}</strong>.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fillHelix}>Precargar datos Helix</Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {SLOTS.map((s) => (
            <FilePick key={s.key} label={s.label} hint={s.hint}
              file={files[s.key] ?? null}
              onChange={(f) => setFiles((prev) => ({ ...prev, [s.key]: f }))} />
          ))}
        </div>

        <details className="mt-6 rounded-md border bg-secondary/20 p-4">
          <summary className="cursor-pointer text-sm font-semibold">Datos del patrón (opcional — para crear / actualizar el registro patronal)</summary>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Field label="Razón social" v={patron.razonSocial} on={(v) => setPatron(s => ({ ...s, razonSocial: v }))} />
            <Field label="RFC patrón" v={patron.rfcPatron} on={(v) => setPatron(s => ({ ...s, rfcPatron: v.toUpperCase() }))} max={13} />
            <Field label="Actividad económica" v={patron.actividadEconomica} on={(v) => setPatron(s => ({ ...s, actividadEconomica: v }))} />
            <Field label="Domicilio" v={patron.domicilio} on={(v) => setPatron(s => ({ ...s, domicilio: v }))} />
            <Field label="CP" v={patron.cp} on={(v) => setPatron(s => ({ ...s, cp: v }))} max={5} />
            <Field label="Municipio" v={patron.municipio} on={(v) => setPatron(s => ({ ...s, municipio: v }))} />
            <Field label="Estado" v={patron.estado} on={(v) => setPatron(s => ({ ...s, estado: v }))} />
            <Field label="Teléfono" v={patron.telefono} on={(v) => setPatron(s => ({ ...s, telefono: v }))} />
            <Field label="Representante legal" v={patron.representanteLegal} on={(v) => setPatron(s => ({ ...s, representanteLegal: v }))} />
            <Field label="Delegación IMSS" v={patron.delegacion} on={(v) => setPatron(s => ({ ...s, delegacion: v }))} />
            <Field label="Subdelegación" v={patron.subdelegacion} on={(v) => setPatron(s => ({ ...s, subdelegacion: v }))} />
            <Field label="Clave subdelegación" v={patron.subdelegacionClave} on={(v) => setPatron(s => ({ ...s, subdelegacionClave: v }))} max={4} />
            <Field label="Área geográfica" v={patron.areaGeografica} on={(v) => setPatron(s => ({ ...s, areaGeografica: v.toUpperCase() }))} max={1} />
            <Field label="Clase riesgo" v={patron.claseRiesgo} on={(v) => setPatron(s => ({ ...s, claseRiesgo: v.toUpperCase() }))} max={5} />
            <Field label="Fracción" v={patron.fraccion} on={(v) => setPatron(s => ({ ...s, fraccion: v }))} max={4} />
            <Field label="Prima RT (%)" v={patron.primaRiesgo} on={(v) => setPatron(s => ({ ...s, primaRiesgo: v }))} placeholder="0.98472" />
          </div>
        </details>

        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={doPreview} disabled={loading}>Previsualizar</Button>
          <Button onClick={doImport} disabled={loading || !preview}>Importar a {org.razon_social}</Button>
        </div>
      </div>

      {preview && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md border bg-card p-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Registros patronales detectados: <strong>{preview.registros.join(", ") || "—"}</strong>
          </div>
          {!!preview.asegs?.length && <Summary title={`Asegurados (${preview.asegs.length})`} rows={preview.asegs.slice(0, 50)} cols={[
            ["NSS", (r: any) => r.nss], ["RFC", (r: any) => r.rfc], ["Nombre", (r: any) => r.nombre_completo],
            ["CURP", (r: any) => r.curp], ["Alta", (r: any) => r.fecha_alta], ["SBC", (r: any) => `$${r.sdi.toFixed(2)}`],
          ]} />}
          {!!preview.afils?.length && <Summary title={`Datos personales (${preview.afils.length})`} rows={preview.afils.slice(0, 50)} cols={[
            ["NSS", (r: any) => r.nss], ["Nacimiento", (r: any) => r.fecha_nacimiento ?? "—"],
            ["Sexo", (r: any) => r.sexo ?? "—"], ["Entidad", (r: any) => r.entidad_nacimiento],
            ["Ocupación", (r: any) => r.ocupacion],
          ]} />}
          {!!preview.movs?.length && <Summary title={`Movimientos (${preview.movs.length})`} rows={preview.movs.slice(0, 50)} cols={[
            ["NSS", (r: any) => r.nss], ["Tipo", (r: any) => TIPO_MOV_LABEL[r.tipo] ?? r.tipo],
            ["Fecha", (r: any) => r.fecha], ["Días", (r: any) => r.dias ?? "—"],
            ["SBC nuevo", (r: any) => r.sdi != null ? `$${r.sdi.toFixed(2)}` : "—"],
            ["Folio", (r: any) => r.folio ?? "—"],
          ]} />}
          {!!preview.incaps?.length && <Summary title={`Incapacidades (${preview.incaps.length})`} rows={preview.incaps.slice(0, 50)} cols={[
            ["NSS", (r: any) => r.nss], ["Tipo", (r: any) => TIPO_INCAP_LABEL[r.tipo] ?? r.tipo],
            ["Folio", (r: any) => r.folio], ["Inicio", (r: any) => r.fecha_inicio],
            ["Fin", (r: any) => r.fecha_fin ?? "—"], ["Días", (r: any) => r.dias],
          ]} />}
          {!!preview.creds?.length && <Summary title={`Créditos INFONAVIT (${preview.creds.length})`} rows={preview.creds.slice(0, 50)} cols={[
            ["NSS", (r: any) => r.nss], ["Crédito", (r: any) => r.credito],
            ["Tipo", (r: any) => r.tipo_descuento], ["Factor", (r: any) => r.factor],
            ["Inicio", (r: any) => r.fecha_inicio ?? "—"],
          ]} />}
        </div>
      )}

      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-200">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Cómo obtener estos archivos del SUA:</strong> En el SUA de escritorio entra a <em>Utilerías → Exportar → Crear Archivo</em> y selecciona Asegurados, Afiliación, Movimientos, Incapacidades y Créditos. Cada uno genera un .TXT con el layout oficial que esta página interpreta.
          </div>
        </div>
      </div>
    </div>
  );
}

function FilePick({ label, hint, file, onChange }: { label: string; hint: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <label className="mt-1 flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed bg-secondary/30 px-2 hover:bg-secondary/50">
        <Upload className="h-4 w-4 text-muted-foreground" />
        <span className="line-clamp-1 break-all text-center text-[11px] font-medium">{file ? file.name : "Selecciona .TXT"}</span>
        <input type="file" accept=".txt,.TXT" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      </label>
      <p className="mt-1 text-[10px] leading-tight text-muted-foreground">{hint}</p>
    </div>
  );
}

function Field({ label, v, on, max, placeholder }: { label: string; v: string; on: (v: string) => void; max?: number; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input className="mt-1" value={v} onChange={(e) => on(e.target.value)} maxLength={max} placeholder={placeholder} />
    </div>
  );
}

function Summary({ title, rows, cols }: { title: string; rows: any[]; cols: [string, (r: any) => any][] }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-2 text-sm font-semibold">{title}</div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-secondary/50 uppercase text-muted-foreground">
            <tr>{cols.map(([h]) => <th key={h} className="px-2 py-1.5 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={i}>{cols.map(([h, fn]) => <td key={h} className="px-2 py-1 font-mono">{String(fn(r) ?? "")}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
