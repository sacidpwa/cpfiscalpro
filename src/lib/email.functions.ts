import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

// Configuración por organización (RFC/razón social → defaults)
const ORG_EMAIL_DEFAULTS: Record<string, { fromEmail: string; summaryTo: string[]; summaryCc: string[]; signature: string; logoUrl: string }> = {
  "HELIX PROTEINAS": {
    fromEmail: "helixgestion@sacid.site",
    summaryTo: ["labra_laross@hotmail.com"],
    summaryCc: ["helixproteinas@gmail.com"],
    signature: "SACID",
    logoUrl: "https://conta-nexus-mexico.lovable.app/__l5e/assets-v1/0d4fb48b-32f8-40e7-97ff-665a663bf28b/sacid-logo.png",
  },
};

export const emailPeriodReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      periodId: z.string().uuid(),
      fromEmail: z.string().email().optional(),
      subjectPrefix: z.string().max(120).optional(),
      summaryPdfBase64: z.string().optional(),
      summaryPdfFilename: z.string().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurada");
    if (!RESEND_API_KEY) throw new Error("Conecta Resend para enviar correos");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: period, error: perr } = await (supabaseAdmin as any)
      .from("payroll_periods")
      .select("id, organization_id, numero, ejercicio, fecha_inicio, fecha_fin, fecha_pago, periodicidad")
      .eq("id", data.periodId).single();
    if (perr || !period) throw new Error("Periodo no encontrado");

    const { data: isMember } = await context.supabase.rpc("is_org_member", {
      _org: period.organization_id, _user: context.userId,
    });
    if (!isMember) throw new Error("Sin acceso");

    const { data: org } = await (supabaseAdmin as any)
      .from("organizations")
      .select("razon_social, nombre_comercial, rfc")
      .eq("id", period.organization_id).single();

    const orgKey = (org?.razon_social || "").toUpperCase().trim();
    const defaults = ORG_EMAIL_DEFAULTS[orgKey];

    const { data: receipts } = await (supabaseAdmin as any)
      .from("payroll_receipts")
      .select("id, employee:employees(id, nombre, apellido_paterno, apellido_materno, email, numero, rfc)")
      .eq("payroll_period_id", data.periodId);

    const refIds = (receipts ?? []).map((r: any) => r.id);
    if (!refIds.length) return { sent: 0, skipped: 0, failed: 0, details: [] as any[], summarySent: false };

    const { data: stamps } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("id, reference_id, estatus, pdf_path, xml_path, uuid_sat, created_at")
      .in("reference_id", refIds)
      .eq("estatus", "timbrado")
      .order("created_at", { ascending: false });

    const stampByRef = new Map<string, any>();
    for (const s of stamps ?? []) {
      if (!stampByRef.has(s.reference_id)) stampByRef.set(s.reference_id, s);
    }

    const fromEmail = data.fromEmail || defaults?.fromEmail || "onboarding@resend.dev";
    const orgName = org?.nombre_comercial || org?.razon_social || "Nómina";
    const fromHeader = `${orgName} <${fromEmail}>`;
    const subject = `${data.subjectPrefix || "Recibo de nómina"} · Periodo ${period.numero}/${period.ejercicio}`;

    const details: Array<{ employee: string; email?: string; status: string; error?: string }> = [];
    let sent = 0, skipped = 0, failed = 0;
    const sinEmail: Array<{ name: string; numero?: string; rfc?: string }> = [];

    // 1) Envío individual a cada trabajador
    for (const r of receipts ?? []) {
      const empName = [r.employee?.nombre, r.employee?.apellido_paterno, r.employee?.apellido_materno]
        .filter(Boolean).join(" ");
      const empEmail = r.employee?.email;
      const stamp = stampByRef.get(r.id);

      if (!empEmail) {
        skipped++;
        details.push({ employee: empName, status: "sin-email" });
        sinEmail.push({ name: empName, numero: r.employee?.numero, rfc: r.employee?.rfc });
        continue;
      }
      if (!stamp) { skipped++; details.push({ employee: empName, email: empEmail, status: "sin-timbrar" }); continue; }

      try {
        const attachments: Array<{ filename: string; content: string }> = [];
        const safeName = [r.employee?.numero, r.employee?.nombre, r.employee?.apellido_paterno]
          .filter(Boolean).join("_").replace(/[^\w-]+/g, "_").slice(0, 80) || stamp.id.slice(0, 8);

        for (const kind of ["pdf", "xml"] as const) {
          const path = kind === "pdf" ? stamp.pdf_path : stamp.xml_path;
          if (!path) continue;
          const bucket = kind === "pdf" ? "cfdi-pdf" : "cfdi-xml";
          const { data: file, error: dlErr } = await supabaseAdmin.storage.from(bucket).download(path);
          if (dlErr || !file) continue;
          const buf = Buffer.from(await file.arrayBuffer());
          attachments.push({ filename: `${safeName}.${kind}`, content: buf.toString("base64") });
        }

        const html = `
          <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">
            <h2 style="margin:0 0 12px">Hola ${r.employee?.nombre ?? ""},</h2>
            <p>Adjunto encontrarás tu recibo de nómina (PDF y XML) correspondiente al periodo
              <strong>${period.numero}/${period.ejercicio}</strong>
              (${period.fecha_inicio} → ${period.fecha_fin}).</p>
            <p style="font-size:13px;color:#555">UUID SAT: <code>${stamp.uuid_sat ?? ""}</code></p>
            <p style="margin-top:24px;font-size:13px;color:#555">Saludos,<br/>${orgName}</p>
          </div>`;

        const res = await fetch(`${GATEWAY_URL}/emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": RESEND_API_KEY,
          },
          body: JSON.stringify({ from: fromHeader, to: [empEmail], subject, html, attachments }),
        });

        if (!res.ok) {
          const txt = await res.text();
          failed++;
          details.push({ employee: empName, email: empEmail, status: "error", error: `${res.status}: ${txt.slice(0, 200)}` });
        } else {
          sent++;
          details.push({ employee: empName, email: empEmail, status: "enviado" });
        }
      } catch (e: any) {
        failed++;
        details.push({ employee: empName, email: empEmail, status: "error", error: e.message });
      }
    }

    // 2) Correo resumen con todos los CFDI a contabilidad
    let summarySent = false;
    let summaryError: string | undefined;
    if (defaults && (defaults.summaryTo.length || defaults.summaryCc.length)) {
      try {
        const allAttachments: Array<{ filename: string; content: string }> = [];

        // Resumen PDF generado por el cliente
        if (data.summaryPdfBase64) {
          allAttachments.push({
            filename: data.summaryPdfFilename || `Resumen_Nomina_${period.ejercicio}_P${period.numero}.pdf`,
            content: data.summaryPdfBase64,
          });
        }

        // Todos los XML y PDF timbrados
        for (const r of receipts ?? []) {
          const stamp = stampByRef.get(r.id);
          if (!stamp) continue;
          const safeName = [r.employee?.numero, r.employee?.nombre, r.employee?.apellido_paterno]
            .filter(Boolean).join("_").replace(/[^\w-]+/g, "_").slice(0, 80) || stamp.id.slice(0, 8);
          for (const kind of ["pdf", "xml"] as const) {
            const path = kind === "pdf" ? stamp.pdf_path : stamp.xml_path;
            if (!path) continue;
            const bucket = kind === "pdf" ? "cfdi-pdf" : "cfdi-xml";
            const { data: file, error: dlErr } = await supabaseAdmin.storage.from(bucket).download(path);
            if (dlErr || !file) continue;
            const buf = Buffer.from(await file.arrayBuffer());
            allAttachments.push({ filename: `${safeName}.${kind}`, content: buf.toString("base64") });
          }
        }

        const totalTimbrados = (stamps ?? []).length;
        const totalRecibos = (receipts ?? []).length;
        const sinEmailRows = sinEmail.length
          ? `<table style="border-collapse:collapse;width:100%;margin-top:8px;font-size:13px">
              <thead><tr style="background:#f3f4f6">
                <th align="left" style="padding:6px;border:1px solid #e5e7eb">#</th>
                <th align="left" style="padding:6px;border:1px solid #e5e7eb">Empleado</th>
                <th align="left" style="padding:6px;border:1px solid #e5e7eb">RFC</th>
              </tr></thead>
              <tbody>
                ${sinEmail.map((e) => `<tr>
                  <td style="padding:6px;border:1px solid #e5e7eb">${e.numero ?? ""}</td>
                  <td style="padding:6px;border:1px solid #e5e7eb">${e.name}</td>
                  <td style="padding:6px;border:1px solid #e5e7eb;font-family:monospace">${e.rfc ?? ""}</td>
                </tr>`).join("")}
              </tbody>
            </table>`
          : `<p style="font-size:13px;color:#16a34a;margin:8px 0 0">Todos los empleados cuentan con correo registrado.</p>`;

        const html = `
          <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px">
            <div style="text-align:center;margin-bottom:16px">
              <img src="${defaults.logoUrl}" alt="${defaults.signature}" style="max-width:180px;height:auto"/>
            </div>
            <h2 style="margin:0 0 12px">Resumen de nómina · Periodo ${period.numero}/${period.ejercicio}</h2>
            <p style="margin:0 0 6px"><strong>${orgName}</strong> · RFC ${org?.rfc ?? ""}</p>
            <p style="margin:0 0 12px;font-size:13px;color:#555">
              Periodicidad: ${period.periodicidad}<br/>
              Del ${period.fecha_inicio} al ${period.fecha_fin} · Pago: ${period.fecha_pago}
            </p>
            <ul style="font-size:14px;line-height:1.7;padding-left:18px">
              <li>Recibos en el periodo: <strong>${totalRecibos}</strong></li>
              <li>CFDI timbrados adjuntos: <strong>${totalTimbrados}</strong></li>
              <li>Correos enviados a empleados: <strong>${sent}</strong></li>
              <li>Sin correo registrado: <strong>${sinEmail.length}</strong></li>
              <li>Errores de envío: <strong>${failed}</strong></li>
            </ul>
            <h3 style="margin:20px 0 6px;font-size:14px">Empleados sin correo registrado</h3>
            ${sinEmailRows}
            <p style="margin-top:16px;font-size:13px;color:#555">
              Se adjunta el PDF resumen del periodo y los archivos XML/PDF de todos los CFDI timbrados.
            </p>
            <p style="margin-top:24px;font-size:13px;color:#555">
              Atentamente,<br/>
              <strong>${defaults.signature}</strong>
            </p>
          </div>`;

        const res = await fetch(`${GATEWAY_URL}/emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": RESEND_API_KEY,
          },
          body: JSON.stringify({
            from: fromHeader,
            to: defaults.summaryTo,
            cc: defaults.summaryCc,
            subject: `Resumen Nómina ${orgName} · Periodo ${period.numero}/${period.ejercicio}`,
            html,
            attachments: allAttachments,
          }),
        });
        if (!res.ok) {
          summaryError = `${res.status}: ${(await res.text()).slice(0, 300)}`;
        } else {
          summarySent = true;
        }
      } catch (e: any) {
        summaryError = e.message;
      }
    }

    // Persistir log del envío para mostrarlo después en "Log de ese periodo"
    try {
      await (supabaseAdmin as any).from("payroll_email_logs").insert({
        organization_id: period.organization_id,
        payroll_period_id: period.id,
        sent_by: context.userId,
        from_email: fromEmail,
        summary_to: defaults?.summaryTo ?? [],
        summary_cc: defaults?.summaryCc ?? [],
        total_recipients: (receipts ?? []).length,
        total_sent: sent,
        total_skipped: skipped,
        total_failed: failed,
        sin_email: sinEmail.length,
        summary_sent: summarySent,
        summary_error: summaryError ?? null,
        details,
      });
    } catch (e) {
      console.error("No se pudo guardar payroll_email_logs", e);
    }

    return { sent, skipped, failed, details, summarySent, summaryError, sinEmail: sinEmail.length };
  });

export const listPeriodEmailLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ periodId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: period } = await (supabaseAdmin as any)
      .from("payroll_periods").select("organization_id").eq("id", data.periodId).single();
    if (!period) throw new Error("Periodo no encontrado");
    const { data: isMember } = await context.supabase.rpc("is_org_member", {
      _org: period.organization_id, _user: context.userId,
    });
    if (!isMember) throw new Error("Sin acceso");
    const { data: logs, error } = await (supabaseAdmin as any)
      .from("payroll_email_logs")
      .select("*")
      .eq("payroll_period_id", data.periodId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return logs ?? [];
  });


// Envía por correo un CFDI timbrado (complemento de pago o carta porte)
export const emailStampedComplement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      stampId: z.string().uuid(),
      to: z.array(z.string().email()).min(1).max(10),
      cc: z.array(z.string().email()).max(10).optional(),
      message: z.string().max(2000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurada");
    if (!RESEND_API_KEY) throw new Error("Conecta Resend para enviar correos");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: stamp, error: serr } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("id, organization_id, kind, uuid_sat, serie, folio, pdf_path, xml_path, estatus, payload, fecha_timbrado, total")
      .eq("id", data.stampId).single();
    if (serr || !stamp) throw new Error("Timbrado no encontrado");
    if (stamp.estatus !== "timbrado") throw new Error("El CFDI no está timbrado");

    const { data: isMember } = await context.supabase.rpc("is_org_member", {
      _org: stamp.organization_id, _user: context.userId,
    });
    if (!isMember) throw new Error("Sin acceso");

    const { data: org } = await (supabaseAdmin as any)
      .from("organizations")
      .select("razon_social, nombre_comercial, rfc")
      .eq("id", stamp.organization_id).single();

    const orgKey = (org?.razon_social || "").toUpperCase().trim();
    const defaults = ORG_EMAIL_DEFAULTS[orgKey];
    const fromEmail = defaults?.fromEmail || "facturacion@sacid.site";
    const orgName = org?.nombre_comercial || org?.razon_social || "Facturación";
    const fromHeader = `${orgName} <${fromEmail}>`;

    // Adjuntar PDF y XML
    const attachments: Array<{ filename: string; content: string }> = [];
    const baseName = [stamp.serie, stamp.folio].filter(Boolean).join("-") || stamp.uuid_sat?.slice(0, 8) || stamp.id.slice(0, 8);
    for (const kind of ["pdf", "xml"] as const) {
      const path = kind === "pdf" ? stamp.pdf_path : stamp.xml_path;
      if (!path) continue;
      const bucket = kind === "pdf" ? "cfdi-pdf" : "cfdi-xml";
      const { data: file, error: dlErr } = await supabaseAdmin.storage.from(bucket).download(path);
      if (dlErr || !file) continue;
      const buf = Buffer.from(await file.arrayBuffer());
      attachments.push({ filename: `${baseName}.${kind}`, content: buf.toString("base64") });
    }
    if (!attachments.length) throw new Error("No hay archivos para adjuntar");

    const tipoLabel = stamp.kind === "pago" ? "Complemento de pago" : stamp.kind === "carta_porte" ? "Carta porte" : "CFDI";
    const subject = `${tipoLabel} ${baseName} · ${orgName}`;
    const userMsg = data.message ? `<p>${data.message.replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>` : "";
    const html = `
      <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 12px">${tipoLabel}</h2>
        <p>Adjuntamos el ${tipoLabel.toLowerCase()} <strong>${baseName}</strong>.</p>
        <p style="font-size:13px;color:#555">UUID SAT: <code>${stamp.uuid_sat ?? ""}</code></p>
        ${userMsg}
        <p style="margin-top:24px;font-size:13px;color:#555">Saludos,<br/>${orgName}</p>
      </div>`;

    const body: any = { from: fromHeader, to: data.to, subject, html, attachments };
    if (data.cc && data.cc.length) body.cc = data.cc;

    const res = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Resend ${res.status}: ${txt.slice(0, 300)}`);
    }
    return { ok: true };
  });


// Envía varias facturas timbradas (mismo RFC de cliente) en un solo correo
export const emailStampedBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      stampIds: z.array(z.string().uuid()).min(1).max(50),
      to: z.array(z.string().email()).min(1).max(10),
      cc: z.array(z.string().email()).max(10).optional(),
      message: z.string().max(2000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurada");
    if (!RESEND_API_KEY) throw new Error("Conecta Resend para enviar correos");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: stamps, error: serr } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("id, organization_id, kind, uuid_sat, serie, folio, pdf_path, xml_path, estatus, payload, fecha_timbrado, total")
      .in("id", data.stampIds);
    if (serr) throw new Error(serr.message);
    if (!stamps?.length) throw new Error("No se encontraron timbrados");

    const orgId = stamps[0].organization_id;
    if (stamps.some((s: any) => s.organization_id !== orgId))
      throw new Error("Las facturas deben ser de la misma organización");
    if (stamps.some((s: any) => s.estatus !== "timbrado"))
      throw new Error("Todas las facturas deben estar timbradas");

    const rfcOf = (s: any) =>
      (s?.payload?.customer?.tax_id ||
        s?.payload?.request?.customer?.tax_id ||
        s?.payload?.receiver?.rfc ||
        "").toString().toUpperCase().trim();
    const rfcs = new Set(stamps.map(rfcOf).filter(Boolean));
    if (rfcs.size > 1) throw new Error("Las facturas seleccionadas deben ser del mismo RFC");
    const rfc = [...rfcs][0] || "";

    const { data: isMember } = await context.supabase.rpc("is_org_member", {
      _org: orgId, _user: context.userId,
    });
    if (!isMember) throw new Error("Sin acceso");

    const { data: org } = await (supabaseAdmin as any)
      .from("organizations")
      .select("razon_social, nombre_comercial, rfc")
      .eq("id", orgId).single();

    const orgKey = (org?.razon_social || "").toUpperCase().trim();
    const defaults = ORG_EMAIL_DEFAULTS[orgKey];
    const fromEmail = defaults?.fromEmail || "facturacion@sacid.site";
    const orgName = org?.nombre_comercial || org?.razon_social || "Facturación";
    const fromHeader = `${orgName} <${fromEmail}>`;

    const attachments: Array<{ filename: string; content: string }> = [];
    const rows: string[] = [];
    let totalSum = 0;
    for (const s of stamps) {
      const baseName = [s.serie, s.folio].filter(Boolean).join("-") || s.uuid_sat?.slice(0, 8) || s.id.slice(0, 8);
      for (const kind of ["pdf", "xml"] as const) {
        const path = kind === "pdf" ? s.pdf_path : s.xml_path;
        if (!path) continue;
        const bucket = kind === "pdf" ? "cfdi-pdf" : "cfdi-xml";
        const { data: file, error: dlErr } = await supabaseAdmin.storage.from(bucket).download(path);
        if (dlErr || !file) continue;
        const buf = Buffer.from(await file.arrayBuffer());
        attachments.push({ filename: `${baseName}.${kind}`, content: buf.toString("base64") });
      }
      totalSum += Number(s.total ?? 0);
      rows.push(`<tr>
        <td style="padding:6px;border:1px solid #e5e7eb;font-family:monospace">${baseName}</td>
        <td style="padding:6px;border:1px solid #e5e7eb;font-family:monospace;font-size:11px">${s.uuid_sat ?? ""}</td>
        <td style="padding:6px;border:1px solid #e5e7eb">${s.fecha_timbrado ? new Date(s.fecha_timbrado).toLocaleDateString() : ""}</td>
        <td style="padding:6px;border:1px solid #e5e7eb;text-align:right">$${Number(s.total ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
      </tr>`);
    }
    if (!attachments.length) throw new Error("No hay archivos para adjuntar");

    const subject = `Facturas (${stamps.length}) · ${rfc || orgName}`;
    const userMsg = data.message ? `<p>${data.message.replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>` : "";
    const html = `
      <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 12px">Facturas adjuntas</h2>
        <p>Adjuntamos <strong>${stamps.length}</strong> CFDI (PDF y XML) para el RFC <strong>${rfc}</strong>.</p>
        <table style="border-collapse:collapse;width:100%;margin-top:8px;font-size:13px">
          <thead><tr style="background:#f3f4f6">
            <th align="left" style="padding:6px;border:1px solid #e5e7eb">Serie-Folio</th>
            <th align="left" style="padding:6px;border:1px solid #e5e7eb">UUID</th>
            <th align="left" style="padding:6px;border:1px solid #e5e7eb">Fecha</th>
            <th align="right" style="padding:6px;border:1px solid #e5e7eb">Total</th>
          </tr></thead>
          <tbody>${rows.join("")}</tbody>
          <tfoot><tr>
            <td colspan="3" style="padding:6px;border:1px solid #e5e7eb;text-align:right"><strong>Total</strong></td>
            <td style="padding:6px;border:1px solid #e5e7eb;text-align:right"><strong>$${totalSum.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</strong></td>
          </tr></tfoot>
        </table>
        ${userMsg}
        <p style="margin-top:24px;font-size:13px;color:#555">Saludos,<br/>${orgName}</p>
      </div>`;

    const body: any = { from: fromHeader, to: data.to, subject, html, attachments };
    if (data.cc && data.cc.length) body.cc = data.cc;

    const res = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Resend ${res.status}: ${txt.slice(0, 300)}`);
    }
    return { ok: true, count: stamps.length, rfc };
  });

// Envío individual de un recibo de nómina (PDF + XML) al correo del empleado.
export const emailSinglePayrollReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      receiptId: z.string().uuid(),
      overrideEmail: z.string().email().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurada");
    if (!RESEND_API_KEY) throw new Error("Conecta Resend para enviar correos");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: receipt, error: rerr } = await (supabaseAdmin as any)
      .from("payroll_receipts")
      .select("id, organization_id, payroll_period_id, employee:employees(id,nombre,apellido_paterno,apellido_materno,email,numero,rfc)")
      .eq("id", data.receiptId).single();
    if (rerr || !receipt) throw new Error("Recibo no encontrado");

    const { data: isMember } = await context.supabase.rpc("is_org_member", {
      _org: receipt.organization_id, _user: context.userId,
    });
    if (!isMember) throw new Error("Sin acceso");

    const { data: period } = await (supabaseAdmin as any)
      .from("payroll_periods")
      .select("numero, ejercicio, fecha_inicio, fecha_fin")
      .eq("id", receipt.payroll_period_id).single();

    const { data: org } = await (supabaseAdmin as any)
      .from("organizations")
      .select("razon_social, nombre_comercial, rfc")
      .eq("id", receipt.organization_id).single();

    const orgKey = (org?.razon_social || "").toUpperCase().trim();
    const defaults = ORG_EMAIL_DEFAULTS[orgKey];
    const fromEmail = defaults?.fromEmail || "onboarding@resend.dev";
    const orgName = org?.nombre_comercial || org?.razon_social || "Nómina";
    const fromHeader = `${orgName} <${fromEmail}>`;

    const to = data.overrideEmail || receipt.employee?.email;
    if (!to) throw new Error("El empleado no tiene correo registrado");

    const { data: stamp } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("id, pdf_path, xml_path, uuid_sat, estatus, created_at")
      .eq("reference_id", receipt.id)
      .eq("kind", "nomina")
      .eq("estatus", "timbrado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!stamp) throw new Error("Este recibo aún no está timbrado");

    const attachments: Array<{ filename: string; content: string }> = [];
    const safeName = [receipt.employee?.numero, receipt.employee?.nombre, receipt.employee?.apellido_paterno]
      .filter(Boolean).join("_").replace(/[^\w-]+/g, "_").slice(0, 80) || stamp.id.slice(0, 8);
    for (const kind of ["pdf", "xml"] as const) {
      const path = kind === "pdf" ? stamp.pdf_path : stamp.xml_path;
      if (!path) continue;
      const bucket = kind === "pdf" ? "cfdi-pdf" : "cfdi-xml";
      const { data: file } = await supabaseAdmin.storage.from(bucket).download(path);
      if (!file) continue;
      const buf = Buffer.from(await file.arrayBuffer());
      attachments.push({ filename: `${safeName}.${kind}`, content: buf.toString("base64") });
    }

    const subject = `Recibo de nómina · Periodo ${period?.numero}/${period?.ejercicio}`;
    const html = `
      <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 12px">Hola ${receipt.employee?.nombre ?? ""},</h2>
        <p>Adjunto encontrarás tu recibo de nómina (PDF y XML) correspondiente al periodo
          <strong>${period?.numero}/${period?.ejercicio}</strong>
          (${period?.fecha_inicio} → ${period?.fecha_fin}).</p>
        <p style="font-size:13px;color:#555">UUID SAT: <code>${stamp.uuid_sat ?? ""}</code></p>
        <p style="margin-top:24px;font-size:13px;color:#555">Saludos,<br/>${orgName}</p>
      </div>`;

    const res = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({ from: fromHeader, to: [to], subject, html, attachments }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Resend ${res.status}: ${txt.slice(0, 300)}`);
    }
    return { ok: true, to };
  });
