import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listPatrones, upsertPatron, deletePatron } from "@/lib/sua.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { EmptyState } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/sua/patrones")({
  component: PatronesPage,
});

const EMPTY = {
  registro_patronal: "",
  rfc_patron: "",
  razon_social: "",
  curp_patron: "",
  prima_riesgo: 0.5,
  prima_riesgo_vigencia: "",
  clase_riesgo: "I",
  fraccion: "",
  modalidad: "40",
  domicilio: "",
  cp: "",
  municipio: "",
  estado: "",
  zona_salario: "general" as "general" | "frontera",
};

function PatronesPage() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const fn = useServerFn(listPatrones);
  const up = useServerFn(upsertPatron);
  const del = useServerFn(deletePatron);

  const { data, isLoading } = useQuery({
    queryKey: ["sua-patrones", org.id],
    queryFn: () => fn({ data: { organizationId: org.id } }),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const editing = !!form.id;

  function startNew() { setForm(EMPTY); setOpen(true); }
  function startEdit(p: any) {
    setForm({
      ...EMPTY, ...p,
      prima_riesgo: Number(p.prima_riesgo),
      prima_riesgo_vigencia: p.prima_riesgo_vigencia ?? "",
    });
    setOpen(true);
  }

  async function save() {
    try {
      await up({ data: { ...form, organizationId: org.id, prima_riesgo: Number(form.prima_riesgo), prima_riesgo_vigencia: form.prima_riesgo_vigencia || null } });
      toast.success(editing ? "Patrón actualizado" : "Patrón registrado");
      qc.invalidateQueries({ queryKey: ["sua-patrones", org.id] });
      setOpen(false);
    } catch (e: any) { toast.error(e.message); }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este patrón? Esto borrará también sus movimientos.")) return;
    try {
      await del({ data: { id } });
      qc.invalidateQueries({ queryKey: ["sua-patrones", org.id] });
      toast.success("Eliminado");
    } catch (e: any) { toast.error(e.message); }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Registros patronales</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={startNew}><Plus className="mr-1 h-4 w-4" />Nuevo patrón</Button>
          </DialogTrigger>
          <PatronDialog form={form} setForm={setForm} onSave={save} editing={editing} />
        </Dialog>
      </div>

      {!data?.length ? (
        <EmptyState icon={Building2} title="Sin patrones registrados" description="Registra tu primer patrón IMSS para empezar." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Registro patronal</th>
                <th className="px-3 py-2 text-left">RFC</th>
                <th className="px-3 py-2 text-left">Razón social</th>
                <th className="px-3 py-2 text-right">Prima RT</th>
                <th className="px-3 py-2 text-left">Clase/Frac.</th>
                <th className="px-3 py-2 text-left">Mod.</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((p: any) => (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono">{p.registro_patronal}</td>
                  <td className="px-3 py-2 font-mono">{p.rfc_patron}</td>
                  <td className="px-3 py-2">{p.razon_social}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(p.prima_riesgo).toFixed(5)}%</td>
                  <td className="px-3 py-2">{p.clase_riesgo ?? "—"} / {p.fraccion ?? "—"}</td>
                  <td className="px-3 py-2">{p.modalidad}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PatronDialog({ form, setForm, onSave, editing }: any) {
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e?.target ? e.target.value : e });
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{editing ? "Editar patrón" : "Nuevo patrón IMSS"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Registro patronal *"><Input value={form.registro_patronal} onChange={set("registro_patronal")} maxLength={11} placeholder="A1234567890" /></Field>
        <Field label="RFC patrón *"><Input value={form.rfc_patron} onChange={set("rfc_patron")} maxLength={13} /></Field>
        <Field label="Razón social *" className="sm:col-span-2"><Input value={form.razon_social} onChange={set("razon_social")} /></Field>
        <Field label="CURP (persona física)"><Input value={form.curp_patron ?? ""} onChange={set("curp_patron")} maxLength={18} /></Field>
        <Field label="Modalidad">
          <Select value={form.modalidad} onValueChange={(v) => setForm({ ...form, modalidad: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 - Trabajadores permanentes</SelectItem>
              <SelectItem value="13">13 - Eventuales del campo</SelectItem>
              <SelectItem value="40">40 - Permanentes (industria/comercio)</SelectItem>
              <SelectItem value="44">44 - Eventuales urbanos</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Prima de riesgo % *"><Input type="number" step="0.00001" value={form.prima_riesgo} onChange={(e) => setForm({ ...form, prima_riesgo: Number(e.target.value) })} /></Field>
        <Field label="Vigencia prima"><Input type="date" value={form.prima_riesgo_vigencia ?? ""} onChange={set("prima_riesgo_vigencia")} /></Field>
        <Field label="Clase"><Input value={form.clase_riesgo ?? ""} onChange={set("clase_riesgo")} placeholder="I-V" /></Field>
        <Field label="Fracción"><Input value={form.fraccion ?? ""} onChange={set("fraccion")} /></Field>
        <Field label="Zona salarial">
          <Select value={form.zona_salario} onValueChange={(v) => setForm({ ...form, zona_salario: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="frontera">Frontera norte</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="CP"><Input value={form.cp ?? ""} onChange={set("cp")} maxLength={5} /></Field>
        <Field label="Domicilio" className="sm:col-span-2"><Input value={form.domicilio ?? ""} onChange={set("domicilio")} /></Field>
        <Field label="Municipio"><Input value={form.municipio ?? ""} onChange={set("municipio")} /></Field>
        <Field label="Estado"><Input value={form.estado ?? ""} onChange={set("estado")} /></Field>
      </div>
      <DialogFooter>
        <Button onClick={onSave}>{editing ? "Guardar" : "Registrar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children, className }: any) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
