# FDB Extractor — microservicio para Aspel NOI/COI

Servicio HTTP que abre un `.FDB` de Firebird (Aspel NOI 7/8/11 y COI) y devuelve
las tablas/filas como JSON o CSV. La app lo llama por HTTPS para importar
empleados sin que tú instales nada local.

Soporta **ODS 11.2** (Firebird 2.5, Aspel NOI 7+) en la imagen base
`jacobalberty/firebird:v2.5`. Para ODS 12/13 (FB 3) ver "Cambiar versión" abajo.

---

## Despliegue gratis en Fly.io (recomendado)

Tiempo: ~10 minutos. No requiere tarjeta para la capa gratis pequeña.

1. **Instala flyctl** (una sola vez):
   - macOS: `brew install flyctl`
   - Windows: `iwr https://fly.io/install.ps1 -useb | iex`
   - Linux: `curl -L https://fly.io/install.sh | sh`
2. **Crea cuenta**: `flyctl auth signup` (o `flyctl auth login` si ya tienes).
3. **Lanza la app** (desde la raíz de este proyecto):
   ```bash
   cd tools/fdb-extractor
   flyctl launch --no-deploy --copy-config --dockerfile Dockerfile \
                 --name fdb-extractor-TU-ALIAS
   ```
   Cuando pregunte por Postgres/Redis: **No**. Acepta copiar `fly.toml`.
4. **Genera y guarda el token** (autenticación entre app y servicio):
   ```bash
   TOKEN=$(openssl rand -hex 32)
   echo "Tu token: $TOKEN"
   flyctl secrets set EXTRACTOR_TOKEN="$TOKEN"
   ```
5. **Despliega**:
   ```bash
   flyctl deploy
   ```
6. **Verifica**:
   ```bash
   curl https://fdb-extractor-TU-ALIAS.fly.dev/health
   # → {"ok":true,"service":"fdb-extractor"}
   ```
7. **Configura la app**: en Lovable, agrega dos secrets de proyecto:
   - `FDB_EXTRACTOR_URL` = `https://fdb-extractor-TU-ALIAS.fly.dev`
   - `FDB_EXTRACTOR_TOKEN` = el token del paso 4

Listo: en `/app/importar` podrás subir `.FDB` directamente.

---

## Alternativa: Render.com

1. Crea cuenta en https://render.com.
2. **New → Web Service → Build from Dockerfile**, conecta tu repo o sube `tools/fdb-extractor/`.
3. Plan: Free (se duerme si no se usa). Region: la que prefieras.
4. Env Vars: `EXTRACTOR_TOKEN` = genera un valor random.
5. Deploy. Copia la URL pública y pégala en los secrets `FDB_EXTRACTOR_URL` / `FDB_EXTRACTOR_TOKEN` de la app.

---

## Endpoints

Todos requieren `Authorization: Bearer <EXTRACTOR_TOKEN>` si el token está configurado.

| Método | Path             | Body (multipart)                | Devuelve                          |
| ------ | ---------------- | ------------------------------- | --------------------------------- |
| GET    | `/health`        | —                               | `{ ok: true }`                    |
| POST   | `/tables`        | `file`                          | `{ tables: [string], count }`    |
| POST   | `/columns`       | `file`, `table`                 | `{ table, columns: [string] }`   |
| POST   | `/extract-json`  | `file`, `table`, `limit?`       | `{ table, total, rows: [obj] }`  |
| POST   | `/extract`       | `file`, `tables?` (csv list)    | ZIP con un CSV por tabla         |

Ejemplo:
```bash
curl -H "Authorization: Bearer $TOKEN" \
     -F file=@NOI11EMPRE22.FDB -F table=EMPLEADO \
     https://fdb-extractor-TU-ALIAS.fly.dev/extract-json
```

---

## Cambiar versión de Firebird

Si tu `.FDB` es ODS 12+ (Aspel NOI más reciente o creado con FB 3),
edita `Dockerfile`:

```diff
- FROM jacobalberty/firebird:v2.5
+ FROM jacobalberty/firebird:v3
```

y redeploya.

---

## Local (opcional, para pruebas)

```bash
docker build -t fdb-extractor ./tools/fdb-extractor
docker run --rm -p 8787:8787 -e EXTRACTOR_TOKEN=dev fdb-extractor

curl -H "Authorization: Bearer dev" \
     -F file=@TU_ARCHIVO.FDB http://localhost:8787/tables
```
