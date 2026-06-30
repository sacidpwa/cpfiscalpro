import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-ui";
import {
  adminListUsers,
  adminResetUserPassword,
  adminSendMagicLink,
  adminToggleBan,
  adminDeleteUser,
  adminTogglePlatformAdmin,
  adminSetOrgRole,
} from "@/lib/admin-users.functions";
import { Search, KeyRound, Mail, Ban, Trash2, Shield, ShieldOff, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  component: UsersPage,
});

function UsersPage() {
  const fn = useServerFn(adminListUsers);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: () => fn() });
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const rows = useMemo(() => {
    const list = data ?? [];
    if (!q.trim()) return list;
    const t = q.toLowerCase();
    return list.filter(
      (u: any) =>
        u.email?.toLowerCase().includes(t) ||
        u.full_name?.toLowerCase().includes(t) ||
        u.memberships?.some((m: any) => m.organizations?.rfc?.toLowerCase().includes(t)),
    );
  }, [data, q]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  return (
    <div>
      <PageHeader title="Usuarios" description="Administra cuentas, contraseñas y roles de plataforma" />
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por email, nombre o RFC…"
            className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Usuario</th>
                  <th className="px-3 py-2">Organizaciones</th>
                  <th className="px-3 py-2">Último acceso</th>
                  <th className="px-3 py-2">Estatus</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u: any) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{u.full_name || u.email}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                      {u.is_platform_admin && (
                        <span className="mt-1 inline-block rounded bg-destructive/15 px-1.5 text-[10px] font-medium text-destructive">
                          SUPER ADMIN
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {u.memberships.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <ul className="space-y-0.5 text-xs">
                          {u.memberships.map((m: any) => (
                            <li key={m.organization_id}>
                              <span className="font-mono">{m.organizations?.rfc}</span>{" "}
                              <span className="text-muted-foreground">· {m.role}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("es-MX") : "Nunca"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {u.banned_until && new Date(u.banned_until) > new Date() ? (
                        <span className="rounded bg-destructive/15 px-2 py-0.5 text-destructive">Bloqueado</span>
                      ) : (
                        <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                          Activo
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setSelected(u)}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-secondary"
                      >
                        Gestionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <UserDialog user={selected} onClose={() => setSelected(null)} onChange={refresh} />}
    </div>
  );
}

function UserDialog({ user, onClose, onChange }: { user: any; onClose: () => void; onChange: () => void }) {
  const reset = useServerFn(adminResetUserPassword);
  const magic = useServerFn(adminSendMagicLink);
  const ban = useServerFn(adminToggleBan);
  const del = useServerFn(adminDeleteUser);
  const toggleAdmin = useServerFn(adminTogglePlatformAdmin);
  const [pw, setPw] = useState("");
  const [magicLink, setMagicLink] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-semibold">{user.full_name || user.email}</h3>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <label className="text-xs font-medium">Cambiar contraseña</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
            />
            <button
              disabled={pw.length < 8}
              onClick={async () => {
                try {
                  await reset({ data: { userId: user.id, newPassword: pw } });
                  toast.success("Contraseña actualizada");
                  setPw("");
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
            >
              <KeyRound className="h-3 w-3" /> Guardar
            </button>
          </div>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <label className="text-xs font-medium">Magic link de acceso</label>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  const r = await magic({ data: { email: user.email } });
                  setMagicLink(r.actionLink);
                  toast.success("Liga generada");
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-secondary"
            >
              <Mail className="h-3 w-3" /> Generar
            </button>
            {magicLink && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(magicLink);
                  toast.success("Copiada al portapapeles");
                }}
                className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-xs"
              >
                <Copy className="h-3 w-3" /> Copiar liga
              </button>
            )}
          </div>
          {magicLink && (
            <p className="break-all text-[10px] text-muted-foreground">{magicLink}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={async () => {
              const isBanned = user.banned_until && new Date(user.banned_until) > new Date();
              try {
                await ban({ data: { userId: user.id, ban: !isBanned } });
                toast.success(isBanned ? "Desbloqueado" : "Bloqueado");
                onChange();
                onClose();
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-secondary"
          >
            <Ban className="h-3 w-3" />
            {user.banned_until && new Date(user.banned_until) > new Date() ? "Desbloquear" : "Bloquear"}
          </button>

          <button
            onClick={async () => {
              try {
                await toggleAdmin({ data: { userId: user.id, make: !user.is_platform_admin } });
                toast.success(user.is_platform_admin ? "Removido de super admin" : "Promovido a super admin");
                onChange();
                onClose();
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-secondary"
          >
            {user.is_platform_admin ? (
              <>
                <ShieldOff className="h-3 w-3" /> Quitar super admin
              </>
            ) : (
              <>
                <Shield className="h-3 w-3" /> Hacer super admin
              </>
            )}
          </button>

          <button
            onClick={async () => {
              if (!confirm("¿Eliminar usuario? Esta acción es permanente.")) return;
              try {
                await del({ data: { userId: user.id } });
                toast.success("Usuario eliminado");
                onChange();
                onClose();
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
            className="ml-auto inline-flex items-center gap-1 rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground hover:opacity-90"
          >
            <Trash2 className="h-3 w-3" /> Eliminar
          </button>
        </div>

        {user.memberships.length > 0 && (
          <OrgRolesEditor user={user} onChange={onChange} />
        )}

        <div className="pt-2 text-right">
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function OrgRolesEditor({ user, onChange }: { user: any; onChange: () => void }) {
  const set = useServerFn(adminSetOrgRole);
  const ROLES = ["owner", "admin", "contador", "nomina", "recursos_humanos", "lector"];
  return (
    <div className="space-y-2 rounded-md border p-3">
      <label className="text-xs font-medium">Roles por organización</label>
      <div className="space-y-1.5">
        {user.memberships.map((m: any) => (
          <div key={m.organization_id} className="flex items-center gap-2 text-xs">
            <span className="flex-1 font-mono">{m.organizations?.rfc}</span>
            <select
              defaultValue={m.role}
              onChange={async (e) => {
                try {
                  await set({
                    data: { userId: user.id, organizationId: m.organization_id, role: e.target.value as any },
                  });
                  toast.success("Rol actualizado");
                  onChange();
                } catch (err: any) {
                  toast.error(err.message);
                }
              }}
              className="rounded border bg-background px-2 py-1"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                if (!confirm("¿Quitar al usuario de esta organización?")) return;
                try {
                  await set({ data: { userId: user.id, organizationId: m.organization_id, role: null } });
                  toast.success("Removido");
                  onChange();
                } catch (err: any) {
                  toast.error(err.message);
                }
              }}
              className="rounded border px-2 py-1 text-destructive hover:bg-destructive/10"
            >
              Quitar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
