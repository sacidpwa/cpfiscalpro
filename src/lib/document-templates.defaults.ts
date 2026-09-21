// ─── Machotes por defecto para cada tipo de documento ───
// Se usan cuando la organización no tiene plantilla personalizada

export const DEFAULT_CONTRATO_TRABAJO = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 2cm; size: letter; }
  body { font-family: "Times New Roman", serif; font-size: 12px; color: #1a1a1a; line-height: 1.6; }
  h1 { text-align: center; font-size: 16px; margin-bottom: 4px; text-transform: uppercase; }
  h2 { text-align: center; font-size: 13px; margin-bottom: 16px; font-weight: normal; }
  .clause { margin-bottom: 12px; text-align: justify; }
  .clause-title { font-weight: bold; text-transform: uppercase; }
  .signature-section { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; }
  .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 4px; }
</style>
</head>
<body>

<h1>CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO INDETERMINADO</h1>
<h2>PERSONAL ADMINISTRATIVO Y DE CONFIANZA</h2>

<p style="text-align:justify">CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO INDETERMINADO que celebran por una parte <strong>{{RAZON_SOCIAL}}</strong>, a quien en lo sucesivo se le denominará "EL PATRÓN", y por la otra <strong>{{NOMBRE_COMPLETO}}</strong>, a quien en lo sucesivo se le denominará "EL TRABAJADOR", al tenor de las siguientes:</p>

<h3 style="margin-top:16px">DECLARACIONES</h3>

<div class="clause">
<p><strong>Declara "EL PATRÓN":</strong></p>
<p>1. Que es una persona FÍSICA/MORAL, con capacidad legal para celebrar el presente contrato.</p>
<p>2. Que su nombre es: <strong>{{RAZON_SOCIAL}}</strong>.</p>
<p>3. Que su RFC es: <strong>{{RFC}}</strong>.</p>
<p>4. Que su domicilio se encuentra ubicado en: <strong>{{DOMICILIO}}</strong>.</p>
<p>5. Que es su voluntad celebrar el presente Contrato Individual de Trabajo por TIEMPO INDETERMINADO.</p>
</div>

<div class="clause">
<p><strong>Declara "EL TRABAJADOR":</strong></p>
<p>1. Que es una persona física, mayor de edad y con capacidad legal para obligarse en términos del presente contrato.</p>
<p>2. Que su nombre completo es: <strong>{{NOMBRE_COMPLETO}}</strong>.</p>
<p>3. Que su CURP es: <strong>{{CURP_EMP}}</strong>.</p>
<p>4. Que su RFC es: <strong>{{RFC_EMP}}</strong>.</p>
<p>5. Que su domicilio se encuentra ubicado en el lugar que ostenta como domicilio fiscal.</p>
<p>6. Que cuenta con los conocimientos, experiencia, aptitudes y habilidades necesarias para desempeñar las funciones correspondientes al puesto para el cual es contratado.</p>
<p>7. Que es su voluntad prestar sus servicios personales y subordinados a "EL PATRÓN".</p>
</div>

<p style="text-align:justify;margin-top:12px">Ambas partes manifiestan que su consentimiento no se encuentra viciado por error, dolo, violencia o mala fe, por lo que están de acuerdo en sujetarse a las siguientes:</p>

<h3 style="margin-top:16px;text-align:center">CLÁUSULAS</h3>

<div class="clause"><span class="clause-title">PRIMERA. PUESTO Y FUNCIONES.</span> "EL TRABAJADOR" se obliga a prestar personalmente sus servicios a "EL PATRÓN" desempeñando el puesto de <strong>{{PUESTO}}</strong>, realizando las funciones propias de su puesto y aquellas actividades relacionadas que le sean encomendadas por su jefe inmediato, de acuerdo con las necesidades de la institución y con las disposiciones del Reglamento Interior de Trabajo.</div>

<div class="clause"><span class="clause-title">SEGUNDA. LUGAR DE TRABAJO.</span> "EL TRABAJADOR" prestará sus servicios en el domicilio ubicado en <strong>{{DOMICILIO}}</strong>, o en aquellos lugares a los que sea comisionado por necesidades de la institución, de acuerdo con las funciones propias de su puesto.</div>

<div class="clause"><span class="clause-title">TERCERA. SUBORDINACIÓN.</span> "EL TRABAJADOR" estará subordinado a "EL PATRÓN" y a los superiores jerárquicos que correspondan conforme al organigrama de la institución, obligándose a desempeñar sus funciones con eficiencia, responsabilidad, calidad y respeto.</div>

<div class="clause"><span class="clause-title">CUARTA. SALARIO.</span> "EL PATRÓN" pagará a "EL TRABAJADOR" un salario de <strong>{{SALARIO_NUM}}</strong> ({{SALARIO_LETRA}}) DIARIO, sujeto a las retenciones, impuestos y descuentos legalmente procedentes.</div>

<div class="clause"><span class="clause-title">QUINTA. DURACIÓN DE LA RELACIÓN LABORAL.</span> La relación laboral objeto del presente contrato es por TIEMPO INDETERMINADO, iniciando el día <strong>{{FECHA_ALTA}}</strong>, y permanecerá vigente mientras subsista la relación de trabajo, sin perjuicio de las causas de terminación o rescisión previstas por la legislación aplicable.</div>

<div class="clause"><span class="clause-title">SEXTA. PERÍODO DE CAPACITACIÓN INICIAL.</span> "EL TRABAJADOR" estará sujeto a un período de capacitación inicial de tres meses, durante el cual será evaluado respecto de la suficiencia, conocimientos, habilidades, aptitudes y competencia necesarios para desempeñar adecuadamente las funciones correspondientes al puesto para el cual ha sido contratado. El período de capacitación inicial será improrrogable y el tiempo transcurrido durante el mismo será considerado para efectos de antigüedad.</div>

<div class="clause"><span class="clause-title">SÉPTIMA. JORNADA Y HORARIO.</span> "EL TRABAJADOR" prestará sus servicios de lunes a viernes en horario de 9:00 a 18:00 horas, con una hora de comida de 15:00 a 16:00 horas, y los sábados de 9:00 a 14:00 horas. El horario podrá modificarse por necesidades de la institución, de acuerdo con las disposiciones aplicables y el Reglamento Interior de Trabajo.</div>

<div class="clause"><span class="clause-title">OCTAVA. REGISTRO DE ASISTENCIA.</span> "EL TRABAJADOR" deberá registrar su entrada y salida mediante el sistema que determine "EL PATRÓN". Se observarán las disposiciones del Reglamento Interior de Trabajo respecto de tolerancias, retardos, faltas y justificantes.</div>

<div class="clause"><span class="clause-title">NOVENA. TIEMPO EXTRAORDINARIO.</span> Se considerará tiempo extraordinario aquel que se labore fuera de la jornada asignada cuando exista indicación o autorización de "EL PATRÓN" o del superior correspondiente.</div>

<div class="clause"><span class="clause-title">DÉCIMA. DÍAS DE DESCANSO.</span> "EL TRABAJADOR" tendrá los días de descanso que correspondan conforme a su jornada y a la legislación aplicable, así como los días de descanso obligatorio establecidos legalmente.</div>

<div class="clause"><span class="clause-title">DÉCIMA PRIMERA. VACACIONES Y PRIMA VACACIONAL.</span> "EL TRABAJADOR" disfrutará de vacaciones y recibirá la prima vacacional correspondiente conforme a la legislación laboral vigente.</div>

<div class="clause"><span class="clause-title">DÉCIMA SEGUNDA. AGUINALDO.</span> "EL PATRÓN" cubrirá a "EL TRABAJADOR" el aguinaldo que corresponda conforme a la legislación laboral aplicable.</div>

<div class="clause"><span class="clause-title">DÉCIMA TERCERA. OBLIGACIONES DEL TRABAJADOR.</span> "EL TRABAJADOR" se obliga a: 1) Cumplir las funciones de su puesto; 2) Observar el Reglamento Interior de Trabajo; 3) Registrar correctamente sus entradas y salidas; 4) Mantener una conducta respetuosa; 5) Utilizar adecuadamente los equipos y materiales; 6) Mantener la confidencialidad de la información; 7) Asistir a las capacitaciones obligatorias; 8) Cumplir las medidas de seguridad e higiene.</div>

<div class="clause"><span class="clause-title">DÉCIMA CUARTA. CONFIDENCIALIDAD.</span> "EL TRABAJADOR" se obliga a guardar absoluta confidencialidad respecto de la información administrativa, financiera, laboral y cualquier otra información a la que tenga acceso con motivo de sus funciones. Queda prohibido revelar, copiar, divulgar o utilizar dicha información para beneficio propio o de terceros sin autorización.</div>

<div class="clause"><span class="clause-title">DÉCIMA QUINTA. PROHIBICIONES.</span> Queda prohibido al trabajador: faltar injustificadamente; utilizar indebidamente los equipos; sustraer bienes de la institución; presentarse bajo los efectos de alcohol o sustancias prohibidas; realizar actos de violencia, acoso u hostigamiento; revelar información confidencial.</div>

<div class="clause"><span class="clause-title">DÉCIMA SEXTA. CAPACITACIÓN.</span> "EL PATRÓN" proporcionará la capacitación que corresponda conforme a los planes y programas establecidos. "EL TRABAJADOR" se obliga a asistir a los cursos que tengan carácter obligatorio.</div>

<div class="clause"><span class="clause-title">DÉCIMA SÉPTIMA. SEGURIDAD E HIGIENE.</span> "EL TRABAJADOR" deberá cumplir las medidas preventivas y de seguridad establecidas por "EL PATRÓN" y las autoridades correspondientes.</div>

<div class="clause"><span class="clause-title">DÉCIMA OCTAVA. SANCIONES.</span> El incumplimiento del Reglamento Interior de Trabajo podrá dar lugar a las medidas disciplinarias correspondientes, incluyendo amonestaciones, llamadas de atención, suspensiones o, cuando legalmente corresponda, rescisión de la relación laboral.</div>

<div class="clause"><span class="clause-title">DÉCIMA NOVENA. TERMINACIÓN Y RESCISIÓN.</span> La relación laboral podrá terminar o rescindirse por las causas previstas en la legislación laboral aplicable.</div>

<div class="clause"><span class="clause-title">VIGÉSIMA. REGLAMENTO INTERIOR.</span> "EL TRABAJADOR" manifiesta conocer y aceptar el Reglamento Interior de Trabajo vigente en "EL PATRÓN", obligándose a cumplirlo durante toda la relación laboral.</div>

<div class="clause"><span class="clause-title">VIGÉSIMA PRIMERA. LEGISLACIÓN APLICABLE.</span> Para todo lo no previsto en el presente contrato serán aplicables las disposiciones de la Ley Federal del Trabajo, la Ley del Seguro Social, el Reglamento Interior de Trabajo y demás disposiciones aplicables.</div>

<p style="text-align:justify;margin-top:20px">Leído que fue el presente contrato y enteradas ambas partes de su contenido y alcance, lo firman por duplicado en <strong>{{CIUDAD_ORG}}</strong>, a los <strong>{{FECHA_ACTUAL}}</strong>.</p>

<div class="signature-section">
  <div>
    <div class="sig-line">"EL PATRÓN"</div>
    <div style="margin-top:4px;font-size:11px">Nombre: {{RAZON_SOCIAL}}</div>
  </div>
  <div>
    <div class="sig-line">"EL TRABAJADOR"</div>
    <div style="margin-top:4px;font-size:11px">Nombre: {{NOMBRE_COMPLETO}}</div>
  </div>
</div>

</body>
</html>
`.trim();

// ─── Carta de renuncia (conforme a LFT Art. 53) ───
export const DEFAULT_RENUNCIA = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 2.5cm; size: letter; }
  body { font-family: "Times New Roman", serif; font-size: 12px; color: #1a1a1a; line-height: 1.8; }
  h1 { text-align: center; font-size: 15px; margin-bottom: 20px; text-transform: uppercase; }
  .header { margin-bottom: 24px; }
  .body-text { text-align: justify; margin-bottom: 16px; }
  .signature-section { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; }
  .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 4px; }
  .article { font-style: italic; color: #555; margin: 12px 0; padding: 8px 12px; border-left: 3px solid #ccc; font-size: 11px; }
</style>
</head>
<body>

<div class="header">
  <p style="text-align:right;margin-bottom:16px">{{CIUDAD_ORG}}, {{FECHA_ACTUAL}}</p>
  <p><strong>PRESENTE</strong></p>
  <p><strong>{{RAZON_SOCIAL}}</strong></p>
  <p>En atención a la presente.</p>
</div>

<h1>CARTA DE RENUNCIA VOLUNTARIA</h1>

<div class="body-text">
  <p>Por medio de la presente, yo <strong>{{NOMBRE_COMPLETO}}</strong>, con RFC <strong>{{RFC_EMP}}</strong>, CURP <strong>{{CURP_EMP}}</strong>, portador(a) del Número de Seguridad Social <strong>{{NSS}}</strong>, me dirijo a ustedes para comunicar mi <strong>RENUNCIA VOLUNTARIA</strong> al puesto de <strong>{{PUESTO}}</strong> que desempeño en esta institución, la cual surtirá efectos a partir del día <strong>{{FECHA_BAJA}}</strong>.
  </p>
</div>

<div class="article">
  <p><strong>Fundamento legal:</strong> De conformidad con el artículo 53, fracción V, de la Ley Federal del Trabajo, el trabajador podrá rescindir el contrato de trabajo en cualquier tiempo, sin que esto le genere responsabilidad alguna, debiendo dar aviso al patrón con razonamiento de por qué se separa del puesto que desempeña, en un plazo no menor de treinta días.</p>
</div>

<div class="body-text">
  <p><strong>Motivo de la renuncia:</strong> {{MOTIVO_BAJA}}</p>
</div>

<div class="body-text">
  <p>Manifiesto que esta decisión la tomo de manera libre y espontánea, sin que medie coacción, violencia, dolo, mala fe o cualquier otra circunstancia que vicie mi consentimiento.</p>
</div>

<div class="body-text">
  <p>Solicito de la manera más atenta se me practique la liquidación que en mi favor corresponda en términos del artículo 50 de la Ley Federal del Trabajo, conforme a los siguientes conceptos:</p>
  <ul style="margin-left:20px;margin-top:8px">
    <li>Salario pendiente de pago</li>
    <li>Parte proporcional del aguinaldo (art. 87 LFT)</li>
    <li>Parte proporcional de vacaciones y prima vacacional (arts. 76 y 80 LFT)</li>
    <li>Prima de antigüedad, en su caso (art. 162 LFT)</li>
    <li>Cualquier otra prestación o bono que me corresponda conforme a mi contrato y al Reglamento Interior de Trabajo</li>
  </ul>
</div>

<div class="body-text">
  <p>Solicito asimismo que se me expida el certificado que acredite los servicios prestados, así como el comprobante de las cuotas al IMSS que se hubieran causado durante la relación laboral, conforme al artículo 29 de la Ley del Seguro Social.</p>
</div>

<div class="body-text">
  <p>Agradezco las oportunidades brindadas durante mi permanencia en la institución y me pongo a disposición para colaborar en el proceso de entrega-recepción de mis funciones durante el período de transición que se determine.</p>
</div>

<div class="body-text">
  <p>Sin otro particular por el momento, hago constar la presente renuncia para los fines legales que al interesado convengan.</p>
</div>

<div class="body-text">
  <p style="text-align:center"><strong>ATENTAMENTE</strong></p>
</div>

<div class="signature-section">
  <div>
    <div class="sig-line">EL TRABAJADOR</div>
    <div style="margin-top:4px;font-size:11px">{{NOMBRE_COMPLETO}}</div>
    <div style="font-size:10px;color:#666">RFC: {{RFC_EMP}}</div>
    <div style="font-size:10px;color:#666">CURP: {{CURP_EMP}}</div>
  </div>
  <div>
    <div class="sig-line">EL PATRÓN</div>
    <div style="margin-top:4px;font-size:11px">{{RAZON_SOCIAL}}</div>
    <div style="font-size:10px;color:#666">Representante Legal</div>
  </div>
</div>

<div style="margin-top:40px;border-top:1px dashed #ccc;padding-top:12px;font-size:10px;color:#888;text-align:center">
  <p>ACUSE DE RECIBO</p>
  <p>El suscrito manifiesta haber recibido la presente carta de renuncia en fecha ___/___/______</p>
  <div style="margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:20px;text-align:center">
    <div>
      <div style="border-top:1px solid #333;margin-top:30px;padding-top:4px">Firma del receptor</div>
    </div>
    <div>
      <div style="border-top:1px solid #333;margin-top:30px;padding-top:4px">Nombre y cargo</div>
    </div>
  </div>
</div>

</body>
</html>
`.trim();

// ─── RIT base (genérico) ───
export const DEFAULT_RIT_GENERICO = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 2cm; size: letter; }
  body { font-family: "Times New Roman", serif; font-size: 11px; color: #1a1a1a; line-height: 1.6; }
  h1 { text-align: center; font-size: 16px; margin-bottom: 16px; text-transform: uppercase; }
  h2 { font-size: 13px; margin-top: 16px; margin-bottom: 8px; }
  .clause { margin-bottom: 10px; text-align: justify; }
  .clause-num { font-weight: bold; }
  .prohibited { background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 8px 12px; margin: 8px 0; }
  .signature-grid { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
  .sig-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; text-align: center; font-size: 10px; }
</style>
</head>
<body>

<h1>REGLAMENTO INTERIOR DE TRABAJO</h1>

<p style="text-align:justify;margin-bottom:12px">
  Todos los empleados que laboren en <strong>{{RAZON_SOCIAL}}</strong> están obligados a cumplir cabalmente con el siguiente reglamento.
</p>
<p style="text-align:justify;margin-bottom:12px">
  El presente Reglamento Interior de Trabajo ha sido formulado de común acuerdo por una Comisión Mixta integrada por representantes de los trabajadores y del patrón, de conformidad con el artículo 424, fracción I, de la Ley Federal del Trabajo.
</p>
<p style="text-align:justify;margin-bottom:16px;font-size:10px;color:#555">
  Fecha de entrada en vigor: {{FECHA_ACTUAL}}
</p>

<div class="clause">
  <span class="clause-num">PRIMERA. Lugar de trabajo.</span>
  El trabajador iniciará y terminará las labores designadas en el domicilio del centro de trabajo ubicado en <strong>{{DOMICILIO}}</strong>, o en aquellos lugares a los que sea comisionado por necesidades de la institución.
</div>

<div class="clause">
  <span class="clause-num">SEGUNDA. Horario de trabajo.</span>
  De acuerdo con el puesto que desempeña:<br/>
  • <strong>Personal Administrativo:</strong> Lunes a viernes de 9:00 a 18:00 hrs, con hora de comida de 15:00 a 16:00 hrs; sábados de 9:00 a 14:00 hrs.<br/>
  • <strong>Personal Operativo:</strong> De acuerdo a las necesidades de la empresa y bajo autorización de la dirección.<br/>
  La jornada laboral deberá ser prestada de forma eficiente, evitando cualquier pérdida de tiempo o distracción personal.
</div>

<div class="clause">
  <span class="clause-num">TERCERA. Asistencia y puntualidad.</span>
  Los trabajadores deberán presentarse puntualmente a sus labores. Se darán 10 minutos de tolerancia a todos los empleados en la hora de entrada. Después del minuto 11 se considerará como un RETARDO MENOR; después del minuto 16 se considera un RETARDO MAYOR; después del minuto 21 solo podrá ingresar previa autorización por escrito de su jefe inmediato.<br/><br/>
  Acumulando 3 retardos menores en la quincena se hará acreedor a un llamado de atención por escrito. Acumulando 2 retardos mayores en la quincena se hará acreedor a un llamado de atención por escrito.<br/><br/>
  Contar con 3 faltas injustificadas en un periodo de 30 días será motivo de rescisión de contrato.
</div>

<div class="clause">
  <span class="clause-num">CUARTA. Vacaciones.</span>
  Los trabajadores que tengan más de un año de servicios disfrutarán de un periodo anual de vacaciones pagadas no inferior a doce días laborables. Dicho periodo aumentará en dos días laborables por cada año subsecuente hasta llegar a veinte días y, a partir del sexto año, aumentará en dos días por cada cinco años de servicios, en términos del artículo 76 de la Ley Federal del Trabajo.
</div>

<div class="clause">
  <span class="clause-num">QUINTA. Definición de labores.</span>
  Cada uno de los colaboradores deberá cumplir con su definición de labores y se hará acreedor a las sanciones reglamentarias en caso de no cumplir con las actividades encomendadas por su jefe inmediato.
</div>

<div class="clause">
  <span class="clause-num">SEXTA. Sanciones administrativas.</span>
  La empresa podrá sancionar a sus trabajadores, amonestándolos o suspendiéndolos, respetando en todo momento el derecho del trabajador a ser oído antes de la aplicación de cualquier sanción. La suspensión como medida disciplinaria no podrá exceder de ocho días y no se impondrán multas a los trabajadores.<br/><br/>
  <strong>Procedimiento:</strong><br/>
  1) Amonestación verbal (máximo 3 eventos)<br/>
  2) Llamado de atención por escrito<br/>
  3) Suspensión sin goce de sueldo (máximo 8 días)<br/>
  4) Rescisión de contrato (conforme al Art. 47 de la LFT)
</div>

<div class="clause">
  <span class="clause-num">SÉPTIMA. Obligaciones de los trabajadores.</span>
  El personal deberá: informar a sus jefes los asuntos relevantes; dirigirse en primera instancia con sus jefes inmediatos para aclaración de dudas; portar vestimenta adecuada al puesto; evitar distracciones dentro del horario laboral; utilizar lenguaje formal, respetuoso y no discriminatorio; asistir a cursos obligatorios; utilizar adecuadamente los equipos proporcionados.
</div>

<div class="clause">
  <span class="clause-num">OCTAVA. Prohibiciones.</span>
  Está prohibido al personal: ejecutar actos que pongan en peligro su seguridad o la de terceros; faltar al trabajo sin causa justificada; substraer materiales o útiles de la empresa; presentarse en estado de embriaguez o bajo influencia de sustancias; hacer propaganda en horas de trabajo; acosar sexualmente a cualquier persona.
</div>

<div class="clause">
  <span class="clause-num">NOVENA. Trabajo libre de violencia, con igualdad y sin discriminación.</span>
  En esta fuente laboral los trabajadores deberán desempeñar sus tareas en un ambiente libre de violencia e igualdad. Se debe evitar el acoso o mobbing entre compañeros, la discriminación laboral por origen étnico, nacionalidad, género, edad, discapacidad, condición social, religión, preferencia sexual u opinión.
</div>

<div class="clause">
  En caso de incumplir con el presente reglamento, será motivo de sanciones y/o rescisión de contrato sin responsabilidad alguna para la institución.
</div>

<div class="signature-grid">
  <div><div class="sig-line">Representante de los trabajadores<br/>Nombre y firma</div></div>
  <div><div class="sig-line">Representante del patrón<br/>Nombre y firma</div></div>
</div>

</body>
</html>
`.trim();

// ─── RIT para Salud ───
export const DEFAULT_RIT_SALUD = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 2cm; size: letter; }
  body { font-family: "Times New Roman", serif; font-size: 11px; color: #1a1a1a; line-height: 1.6; }
  h1 { text-align: center; font-size: 16px; margin-bottom: 16px; text-transform: uppercase; }
  .clause { margin-bottom: 10px; text-align: justify; }
  .clause-num { font-weight: bold; }
  .signature-grid { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
  .sig-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; text-align: center; font-size: 10px; }
</style>
</head>
<body>

<h1>REGLAMENTO INTERIOR DE TRABAJO</h1>
<p style="text-align:justify;margin-bottom:12px">Todos los empleados que laboren en <strong>{{RAZON_SOCIAL}}</strong> están obligados a cumplir cabalmente con el siguiente reglamento.</p>
<p style="text-align:justify;margin-bottom:16px;font-size:10px;color:#555">Fecha de entrada en vigor: {{FECHA_ACTUAL}}</p>

<div class="clause"><span class="clause-num">PRIMERA. Lugar de trabajo.</span> El trabajador iniciará y terminará las labores designadas en el domicilio del centro de trabajo ubicado en <strong>{{DOMICILIO}}</strong>. El personal contará con asientos con respaldo suficiente. Para trabajadores que deban estar de pie, se permitirá un descanso de 5 a 10 minutos por cada hora continua.</div>

<div class="clause"><span class="clause-num">SEGUNDA. Horario de trabajo.</span><br/>
• <strong>Personal Administrativo y de Confianza:</strong> Lunes a viernes de 9:00 a 18:00 hrs, con comida de 15:00 a 16:00 hrs; sábados de 9:00 a 14:00 hrs.<br/>
• <strong>Personal de Enfermería:</strong> Jornada de 9, 12, 24 o 48 horas dependiendo de los requerimientos de la empresa, bajo autorización de la dirección.<br/>
• <strong>Personal de Intendencia:</strong> Lunes a viernes; sábados, domingos y días festivos de 8:00 a 16:00 hrs.<br/>
• <strong>Personal de Mantenimiento:</strong> Lunes a viernes de 8:00 a 16:00 hrs; sábados de 8:00 a 14:00 hrs.</div>

<div class="clause"><span class="clause-num">TERCERA. Asistencia.</span> 10 minutos de tolerancia. Retardo menor después del minuto 11; retardo mayor después del minuto 16; después del minuto 21 solo con autorización escrita. 3 retardos menores en quincena = llamado de atención. 3 faltas injustificadas en 30 días = rescisión de contrato. Solo se aceptarán justificantes de institución de seguridad social o médico del centro laboral.</div>

<div class="clause"><span class="clause-num">CUARTA. Alimentos.</span> Personal administrativo: 1 hora de comida (15:00-16:00 hrs). Personal de enfermería con jornada de 12, 24 o 48 horas: 30 minutos para cada alimento (desayuno, comida y cena) de manera escalonada. Los alimentos se ingerirán en el área de cocina designada.</div>

<div class="clause"><span class="clause-num">QUINTA. Vacaciones.</span> Art. 76 LFT: 12 días mínimos + 2 días por año hasta llegar a 20, luego 2 días por cada 5 años adicionales. Prima vacacional conforme a legislación.</div>

<div class="clause"><span class="clause-num">SEXTA. Sanciones.</span> Amonestación verbal (máx. 3) → Llamado de atención por escrito → Suspensión sin goce de sueldo (máx. 8 días) → Rescisión (Art. 47 LFT). Se respetará en todo momento el derecho del trabajador a ser oído.</div>

<div class="clause"><span class="clause-num">SÉPTIMA. Obligaciones.</span> Cumplir funciones, observar el RIT, registrar asistencia, conducta respetuosa, confidencialidad, asistir a capacitaciones obligatorias, cumplir medidas de seguridad e higiene, portar uniforme correspondiente.</div>

<div class="clause"><span class="clause-num">OCTAVA. Prohibiciones.</span> Faltar sin justificación, usar celular que interfiera con labores, substraer materiales, presentarse en estado de embriaguez, hacer propaganda, acosar sexualmente. <strong>Pruebas de detección de alcohol y sustancias:</strong> La institución podrá solicitar pruebas de alcoholimetría y/o estudios de laboratorio cuando existan circunstancias que hagan presumir el consumo de sustancias. Los resultados serán confidenciales.</div>

<div class="clause"><span class="clause-num">NOVENA. Confidencialidad de pacientes.</span> Queda estrictamente prohibido tratar temas confidenciales en público o en presencia de pacientes o familiares. Tomar fotografías a pacientes o instalaciones sin autorización. Publicar información laboral en redes sociales sin autorización escrita. Relacionarse de forma sentimental con pacientes o familiares de estos.</div>

<div class="clause"><span class="clause-num">DÉCIMA. Trabajo libre de violencia.</span> Ambiente libre de violencia, acoso, mobbing y discriminación. Se fomentará el compañerismo y trabajo en equipo.</div>

<p style="margin-top:20px">En caso de incumplimiento, será motivo de sanciones y/o rescisión de contrato.</p>

<div class="signature-grid">
  <div><div class="sig-line">Representante de los trabajadores</div></div>
  <div><div class="sig-line">Representante del patrón</div></div>
</div>

</body>
</html>
`.trim();

// Mapa de templates por defecto por giro
export const RIT_DEFAULTS: Record<string, string> = {
  salud: DEFAULT_RIT_SALUD,
  comercio: DEFAULT_RIT_GENERICO,
  industrial: DEFAULT_RIT_GENERICO,
  servicios: DEFAULT_RIT_GENERICO,
};

export const TEMPLATE_DEFAULTS: Record<string, string> = {
  contrato_trabajo: DEFAULT_CONTRATO_TRABAJO,
  renuncia: DEFAULT_RENUNCIA,
};
