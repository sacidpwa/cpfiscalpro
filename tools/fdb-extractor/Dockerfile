# Microservicio para extraer datos de archivos Firebird (.FDB) de Aspel NOI/COI
# Soporta ODS 11.2 (FB 2.5 — Aspel NOI 7/8/11) y ODS 12+ (FB 3.0).
#
# Build local:  docker build -t fdb-extractor ./tools/fdb-extractor
# Run local:    docker run --rm -p 8787:8787 fdb-extractor
#
# Despliegue: ver tools/fdb-extractor/README.md (Fly.io / Render).
FROM jacobalberty/firebird:v2.5

USER root
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js start.sh ./
RUN chmod +x start.sh

# El entrypoint base de jacobalberty crea SYSDBA con esta contraseña
ENV ISC_PASSWORD=masterkey \
    FIREBIRD_USER=SYSDBA \
    FIREBIRD_PASSWORD=masterkey \
    PORT=8787

EXPOSE 8787
CMD ["/app/start.sh"]
