
# Importar respaldo COI completo (66 DBFs) sin perder información

## Objetivo

Subir los 66 archivos `.DBF` de un solo respaldo COI de Aspel y que **toda** la información quede almacenada en la base de datos: lo que ya conocemos en tablas tipadas (para que la contabilidad funcione), y lo demás en una tabla "landing" de respaldo en JSONB, para no perder nada y poder mapearlo después si surge una necesidad.

## Estrategia en dos capas

```text
DBF subido ──► detector por nombre de archivo
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  tabla tipada conocida    aspel_raw_rows (JSONB)
   (cuentas, polizas,        guarda TODA fila tal cual
    movimientos, saldos,     + metadatos del archivo
    depto, diario, …)
```

Cualquier DBF cuyo nombre no reconozcamos cae a `aspel_raw_rows` con su contenido íntegro en JSONB → nada se pierde, y podemos promoverlo a tabla tipada cuando lo necesitemos sin pedirte que vuelvas a subir nada.

## Lo que se va a construir

### 1. Nuevas tablas en la base de datos

**Tipadas (alimentan funciones contables):**

- `journal_entries` y `journal_lines` ya existen → se reutilizan para `POLIZAS*.DBF` y `MOVPOL*.DBF` (encabezados y partidas por mes).
- `account_balances` (nueva) ← `SALDOS*.DBF`: saldo inicial, cargos, abonos y saldo final por cuenta × periodo × ejercicio. Es la base para balanza de comprobación y estados financieros.
- `cost_centers` (nueva) ← `DEPTOS.DBF` / `CCOSTOS.DBF`: centros de costo / departamentos.
- `journal_types` (nueva) ← `DIARIOS.DBF`: tipos de póliza (Dr/Eg/Ig).
- `currencies` (nueva) ← `MONEDAS.DBF`: catálogo de monedas y tipo de cambio.
- `sat_account_map` (nueva) ← `ASOCSAT.DBF`: amarre cuenta contable ↔ cuenta SAT (código agrupador) para la contabilidad electrónica.
- `fiscal_years` (nueva) ← `EJERCIC.DBF`: ejercicios y periodos abiertos/cerrados.

**Landing genérica (recibe TODO):**

- `aspel_raw_imports` — un registro por DBF subido (org, archivo, sistema COI/NOI, tabla detectada, total de filas, fecha).
- `aspel_raw_rows` — una fila por registro del DBF: `import_id`, `table_name`, `row_index`, `data jsonb` (la fila completa con todos los campos originales).

Todas con RLS por `organization_id` y los `GRANT` correspondientes.

### 2. Backend: importador inteligente

`src/lib/import-dbf.functions.ts` se amplía con un **detector por nombre**:

```text
CUENTAS*.DBF    → public.accounts (ya existe)
POLIZAS*.DBF    → public.journal_entries
MOVPOL*.DBF     → public.journal_lines (FK por número de póliza)
SALDOS*.DBF     → public.account_balances
DEPTOS*.DBF     → public.cost_centers
DIARIOS*.DBF    → public.journal_types
MONEDAS*.DBF    → public.currencies
ASOCSAT*.DBF    → public.sat_account_map
EJERCIC*.DBF    → public.fiscal_years
EMPLEAD*.DBF    → public.employees (ya existe, NOI)
*  (cualquier otro) → aspel_raw_rows (JSONB)
```

Cada DBF reconocido va a su tabla tipada con upsert idempotente (por organización + clave natural) — puedes resubir el mismo respaldo y no se duplica.

### 3. Frontend: subida múltiple

En `src/routes/_authenticated/app/importar.tsx`:

- El input acepta `multiple` (selección o arrastre de varios archivos).
- Se elimina el selector manual "Catálogo COI / Empleados NOI": el tipo se detecta del nombre del archivo.
- Una tabla de progreso muestra cada archivo con: detectado como `X`, filas OK, errores, o "guardado como respaldo" si cayó a `aspel_raw_rows`.
- Los DBFs se procesan en serie (uno tras otro) para no saturar el server; al terminar, refresca historial y catálogos.

### 4. Lo que NO entra en este plan (siguiente iteración)

- Pantallas para visualizar pólizas, balanza y mayor a partir de los nuevos datos. Primero metemos la información; las vistas las hacemos cuando confirmes que el importador trajo todo correcto.
- Promover datos de `aspel_raw_rows` a tablas tipadas nuevas. Se hace bajo demanda cuando aparezca un DBF útil que aún no esté mapeado.

## Detalles técnicos

- **Idempotencia**: cada tabla tipada usa `ON CONFLICT (organization_id, <clave natural>) DO UPDATE`. Clave natural por tabla: `accounts.code`, `journal_entries(tipo, numero, fecha)`, `journal_lines(entry_id, partida)`, `account_balances(account_code, ejercicio, periodo)`, etc.
- **Encoding**: los DBF de Aspel suelen venir en CP850/Windows-1252. El parser actual ya lo maneja; se mantiene.
- **Detección**: regex sobre el nombre base del archivo, case-insensitive, ignorando sufijos numéricos (`POLIZAS01.DBF`, `MOV2024_01.DBF`).
- **Orden de carga sugerido al usuario**: catálogos primero (CUENTAS, DEPTOS, DIARIOS, EJERCIC), luego pólizas y movimientos, luego saldos. El UI ordena automáticamente al subir un lote.
- **Volumen**: con 66 archivos haremos request por archivo (no un mega-POST) para evitar el límite de 10 MB por payload y dar feedback granular.

## Lo que necesito de ti antes de implementar

Confirma **una** de estas:

1. **Adelante con todo el plan** (creo las 7 tablas nuevas + landing + multi-upload). ~ trabajo grande pero te deja la contabilidad COI completa cargada.
2. **Solo la capa landing + multi-upload** (todo cae a `aspel_raw_rows` como JSONB). Más rápido, no pierdes nada, pero las pólizas/saldos no son consultables hasta que mapeemos después.
3. **Antes de decidir, pégame el `ls *.DBF`** del respaldo. Con los nombres reales ajusto exactamente qué tablas crear (puede que tengas tablas que no listé, o que falten algunas que sí listé).

¿Cuál seguimos?
