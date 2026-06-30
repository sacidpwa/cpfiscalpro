#!/usr/bin/env bash
# Arranca Firebird 2.5 en background y luego el servicio Node.
set -e

# El entrypoint de la imagen jacobalberty/firebird inicializa SYSDBA y arranca fbguard.
# Lo lanzamos en background y esperamos a que el puerto 3050 esté listo.
( /entrypoint.sh firebird >/var/log/firebird.log 2>&1 ) &
FB_PID=$!

echo "Esperando Firebird en 127.0.0.1:3050…"
for i in $(seq 1 60); do
  if (echo > /dev/tcp/127.0.0.1/3050) >/dev/null 2>&1; then
    echo "Firebird listo."
    break
  fi
  sleep 1
done

# Si Firebird murió, fallar rápido
if ! kill -0 "$FB_PID" 2>/dev/null; then
  echo "ERROR: Firebird no arrancó. Log:" >&2
  tail -n 200 /var/log/firebird.log >&2 || true
  exit 1
fi

exec node /app/server.js
