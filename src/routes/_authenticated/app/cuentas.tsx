import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, Fragment } from "react";
import { listAccounts, upsertAccount, getAccountSaldos } from "@/lib/accounting.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader } from "@/components/app-ui";
import { Plus, X, Pencil, Search, ChevronDown, ChevronRight, Wallet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/cuentas")({
  component: Cuentas,
});

const MESES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
  "Cierre",
];

// Construye árbol padre-hijo-nieto a partir de la lista plana de cuentas
function buildTree(accounts: any[]) {
  const sorted = [...accounts].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const nodes: any[] = [];
  const byCode: Record<string, any> = {};

  for (const a of sorted) {
    const node = { ...a, children: [] };
    byCode[a.codigo] = node;
    nodes.push(node);
  }

  // Encontrar el padre de cada cuenta: el código de mayor nivel que es prefijo
  const roots: any[] = [];
  for (const node of nodes) {
    const nivel = node.nivel ?? 1;
    // Buscar padre: el código de nivel (nivel-1) que es prefijo del código actual
    const sigDigits = 2 * nivel - 1; // dígitos significativos para este nivel
    let parent: any = null;
    for (let n = nivel - 1; n >= 1; n--) {
      const parentSig = 2 * n - 1;
      const prefix = node.codigo.substring(0, parentSig);
      const candidates = nodes.filter(
        (x) => x.codigo.startsWith(prefix) && (x.nivel ?? 1) === n && x.codigo !== node.codigo,
      );
      if (candidates.length) {
        parent = candidates[0];
        break;
      }
    }
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function Cuentas() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const list = useServerFn(listAccounts);
  const upsert = useServerFn(upsertAccount);
  const { data, isLoading } = useQuery({
    queryKey: ["accounts", org.id],
    queryFn: () => list({ data: { organizationId: org.id } }),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selectedCodigo, setSelectedCodigo] = useState<string | null>(null);

  // Filtrar por búsqueda
  const filtered = useMemo(() => {
    if (!search.trim()) return data ?? [];
    const q = search.toLowerCase();
    return (data ?? []).filter(
      (a: any) => a.codigo.toLowerCase().includes(q) || (a.nombre ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  // Construir árbol
  const tree = useMemo(() => buildTree(filtered), [filtered]);

  // Expandir todos cuando hay búsqueda activa
  const effectiveCollapsed = search.trim() ? {} : collapsed;

  function toggle(codigo: string) {
    setCollapsed((prev) => ({ ...prev, [codigo]: !prev[codigo] }));
  }

  async function save(f: any) {
    try {
      await upsert({ data: { ...f, organizationId: org.id, nivel: Number(f.nivel) } });
      toast.success("Cuenta guardada");
      qc.invalidateQueries({ queryKey: ["accounts", org.id] });
      setOpen(false);
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Catálogo de cuentas"
        description="Estructura contable conforme al código agrupador SAT"
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Nueva cuenta
          </button>
        }
      />
      <div className="p-8">
        {/* Buscador */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1" style={{ maxWidth: 400 }}>
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por código o nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <span className="text-xs text-muted-foreground">{filtered.length} cuentas</span>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left" style={{ width: "45%" }}>
                    Cuenta
                  </th>
                  <th className="px-3 py-2 text-left">C. SAT</th>
                  <th className="px-3 py-2 text-left">Naturaleza</th>
                  <th className="px-3 py-2 text-center">Nivel</th>
                  <th className="px-3 py-2 text-center">Mov.</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tree.map((node: any) => (
                  <TreeNode
                    key={node.codigo}
                    node={node}
                    depth={0}
                    collapsed={effectiveCollapsed}
                    onToggle={toggle}
                    selectedCodigo={selectedCodigo}
                    onSelect={setSelectedCodigo}
                    onEdit={(a: any) => {
                      setEditing(a);
                      setOpen(true);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && (
        <AccountForm
          initial={editing}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSave={save}
        />
      )}
      {selectedCodigo && (
        <SaldosDrawer
          codigo={selectedCodigo}
          onClose={() => setSelectedCodigo(null)}
          orgId={org.id}
        />
      )}
    </div>
  );
}

function TreeNode({ node, depth, collapsed, onToggle, selectedCodigo, onSelect, onEdit }: any) {
  const isCollapsed = collapsed[node.codigo];
  const hasChildren = node.children?.length > 0;
  const isSelected = selectedCodigo === node.codigo;
  const pad = 0.75 + depth * 1.5;

  return (
    <Fragment>
      <tr
        className={`hover:bg-secondary/30 cursor-pointer ${isSelected ? "bg-primary/10" : ""}`}
        onClick={() => onSelect(node.codigo)}
      >
        <td className="px-3 py-2" style={{ paddingLeft: `${pad}rem` }}>
          <div className="flex items-center gap-1.5">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(node.codigo);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="inline-block w-3.5" />
            )}
            <span className="font-mono text-xs text-muted-foreground">{node.codigo}</span>
            <span className={`font-medium ${node.acumulativa ? "text-muted-foreground" : ""}`}>
              {node.nombre}
            </span>
            {node.acumulativa && (
              <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                ACUM
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
          {node.codigo_agrupador ?? "—"}
        </td>
        <td className="px-3 py-2 capitalize">{node.naturaleza}</td>
        <td className="px-3 py-2 text-center">{node.nivel}</td>
        <td className="px-3 py-2 text-center">{node.acumulativa ? "" : "✓"}</td>
        <td className="px-3 py-2 text-right">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(node);
            }}
            className="rounded p-1 hover:bg-secondary"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>
      {!isCollapsed &&
        hasChildren &&
        node.children.map((child: any) => (
          <TreeNode
            key={child.codigo}
            node={child}
            depth={depth + 1}
            collapsed={collapsed}
            onToggle={onToggle}
            selectedCodigo={selectedCodigo}
            onSelect={onSelect}
            onEdit={onEdit}
          />
        ))}
    </Fragment>
  );
}

function SaldosDrawer({
  codigo,
  onClose,
  orgId,
}: {
  codigo: string;
  onClose: () => void;
  orgId: string;
}) {
  const fn = useServerFn(getAccountSaldos);
  const { data, isLoading } = useQuery({
    queryKey: ["account-saldos", orgId, codigo],
    queryFn: () => fn({ data: { organizationId: orgId, codigo } }),
  });

  // Agrupar por ejercicio
  const byEjercicio: Record<number, any[]> = {};
  (data ?? []).forEach((s: any) => {
    if (!byEjercicio[s.ejercicio]) byEjercicio[s.ejercicio] = [];
    byEjercicio[s.ejercicio].push(s);
  });
  const ejercicios = Object.keys(byEjercicio)
    .map(Number)
    .sort((a, b) => b - a);

  function fmt(n: number) {
    return Number(n).toLocaleString("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-auto border-l bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Saldos de la cuenta</h2>
            <p className="font-mono text-xs text-muted-foreground">{codigo}</p>
          </div>
          <button onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando saldos…</p>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">Sin saldos registrados.</p>
        ) : (
          <div className="space-y-4">
            {ejercicios.map((ej) => (
              <div key={ej}>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Ejercicio {ej}
                </h3>
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/40">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Periodo</th>
                        <th className="px-2 py-1.5 text-right">Saldo Final</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {byEjercicio[ej].map((s: any) => (
                        <tr key={`${s.ejercicio}-${s.periodo}`}>
                          <td className="px-2 py-1">
                            {s.periodo === 13
                              ? "Cierre (P.13)"
                              : (MESES[s.periodo - 1] ?? `P.${s.periodo}`)}
                          </td>
                          <td className="px-2 py-1 text-right font-mono">{fmt(s.saldo_final)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 rounded-md border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Click en otra cuenta para ver sus saldos
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountForm({ initial, onClose, onSave }: any) {
  const [f, setF] = useState({
    id: initial?.id,
    codigo: initial?.codigo ?? "",
    nombre: initial?.nombre ?? "",
    codigo_agrupador: initial?.codigo_agrupador ?? "",
    naturaleza: initial?.naturaleza ?? "deudora",
    nivel: initial?.nivel ?? 2,
    acumulativa: initial?.acumulativa ?? false,
  });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(f);
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border bg-card p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{initial ? "Editar" : "Nueva"} cuenta</h2>
          <button type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Lbl label="Código">
            <input
              className="inp font-mono"
              value={f.codigo}
              onChange={(e) => setF({ ...f, codigo: e.target.value })}
              required
            />
          </Lbl>
          <Lbl label="Cód. Agrupador SAT">
            <input
              className="inp font-mono"
              value={f.codigo_agrupador}
              onChange={(e) => setF({ ...f, codigo_agrupador: e.target.value })}
            />
          </Lbl>
          <Lbl label="Nombre" className="col-span-2">
            <input
              className="inp"
              value={f.nombre}
              onChange={(e) => setF({ ...f, nombre: e.target.value })}
              required
            />
          </Lbl>
          <Lbl label="Naturaleza">
            <select
              className="inp"
              value={f.naturaleza}
              onChange={(e) => setF({ ...f, naturaleza: e.target.value })}
            >
              <option value="deudora">Deudora</option>
              <option value="acreedora">Acreedora</option>
            </select>
          </Lbl>
          <Lbl label="Nivel">
            <input
              type="number"
              min={1}
              max={6}
              className="inp"
              value={f.nivel}
              onChange={(e) => setF({ ...f, nivel: Number(e.target.value) })}
            />
          </Lbl>
          <label className="col-span-2 mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.acumulativa}
              onChange={(e) => setF({ ...f, acumulativa: e.target.checked })}
            />{" "}
            Cuenta acumulativa (no recibe movimientos)
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Guardar
          </button>
        </div>
        <style>{`.inp{width:100%;border:1px solid var(--color-border);background:var(--color-background);border-radius:6px;padding:.4rem .6rem;font-size:.875rem}`}</style>
      </form>
    </div>
  );
}

function Lbl({ label, children, className = "" }: any) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
