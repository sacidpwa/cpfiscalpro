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
  .art-ref { font-style: italic; color: #555; font-size: 11px; }
  .signature-section { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; }
  .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 4px; }
</style>
</head>
<body>

<h1>CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO {{PLAZO_CONTRATO}}</h1>
<h2>PERSONAL ADMINISTRATIVO Y DE CONFIANZA</h2>

<p style="text-align:justify">CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO {{PLAZO_CONTRATO}} que celebran por una parte <strong>{{RAZON_SOCIAL}}</strong>, por conducto de su {{TIPO_PATRON}} {{REPRESENTANTE_LEGAL}}, a quien en lo sucesivo se le denominará "EL PATRÓN", y por la otra <strong>{{NOMBRE_COMPLETO}}</strong>, a quien en lo sucesivo se le denominará "EL TRABAJADOR", al tenor de las siguientes:</p>

<h3 style="margin-top:16px">DECLARACIONES</h3>

<div class="clause">
<p><strong>Declara "EL PATRÓN":</strong></p>
<p>1. Que es una persona <strong>{{TIPO_PATRON}}</strong>, con capacidad legal para celebrar el presente contrato.</p>
<p>2. Que su nombre es: <strong>{{RAZON_SOCIAL}}</strong>.</p>
<p>3. Que su RFC es: <strong>{{RFC}}</strong>.</p>
<p>4. Que su domicilio se encuentra ubicado en: <strong>{{DOMICILIO}}</strong>.</p>
<p>5. Que es su voluntad celebrar el presente Contrato Individual de Trabajo por TIEMPO {{PLAZO_CONTRATO}}.</p>
{{DECLARACION_REP_LEGAL}}</div>

<div class="clause">
<p><strong>Declara "EL TRABAJADOR":</strong></p>
<p>1. Que es una persona física, mayor de edad y con capacidad legal para obligarse en términos del presente contrato.</p>
<p>2. Que su nombre completo es: <strong>{{NOMBRE_COMPLETO}}</strong>.</p>
<p>3. Que su CURP es: <strong>{{CURP_EMP}}</strong>.</p>
<p>4. Que su RFC es: <strong>{{RFC_EMP}}</strong>.</p>
<p>5. Que cuenta con los conocimientos, experiencia, aptitudes y habilidades necesarias para desempeñar las funciones correspondientes al puesto para el cual es contratado.</p>
<p>6. Que es su voluntad prestar sus servicios personales y subordinados a "EL PATRÓN".</p>
</div>

<p style="text-align:justify;margin-top:12px">Ambas partes manifiestan que su consentimiento no se encuentra viciado por error, dolo, violencia o mala fe, por lo que están de acuerdo en sujetarse a las siguientes:</p>

<h3 style="margin-top:16px;text-align:center">CLÁUSULAS</h3>

<div class="clause"><span class="clause-title">PRIMERA. PUESTO Y FUNCIONES.</span> "EL TRABAJADOR" se obliga a prestar personalmente sus servicios a "EL PATRÓN" desempeñando el puesto de <strong>{{PUESTO}}</strong>, realizando las funciones propias de su puesto y aquellas actividades relacionadas que le sean encomendadas por su jefe inmediato, de acuerdo con las necesidades de la institución y con las disposiciones del Reglamento Interior de Trabajo. <span class="art-ref">(Arts. 5 y 7, Ley Federal del Trabajo)</span></div>

<div class="clause"><span class="clause-title">SEGUNDA. LUGAR DE TRABAJO.</span> "EL TRABAJADOR" prestará sus servicios en el domicilio ubicado en <strong>{{DOMICILIO}}</strong>, o en aquellos lugares a los que sea comisionado por necesidades de la institución, de acuerdo con las funciones propias de su puesto. <span class="art-ref">(Art. 82, Ley Federal del Trabajo — lugar convenido para la prestación de servicios)</span></div>

<div class="clause"><span class="clause-title">TERCERA. SUBORDINACIÓN.</span> "EL TRABAJADOR" estará subordinado a "EL PATRÓN" y a los superiores jerárquicos que correspondan conforme al organigrama de la institución, obligándose a desempeñar sus funciones con eficiencia, responsabilidad, calidad y respeto. <span class="art-ref">(Art. 5, fracción II, Ley Federal del Trabajo — subordinación del trabajador al patrón)</span></div>

<div class="clause"><span class="clause-title">CUARTA. SALARIO.</span> "EL PATRÓN" pagará a "EL TRABAJADOR" un salario de <strong>{{SALARIO_SEMANAL}}</strong> ({{SALARIO_SEMANAL_LETRA}}) SEMANAL, sujeto a las retenciones, impuestos y descuentos legalmente procedentes. El salario diario integra es de <strong>{{SALARIO_NUM}}</strong> ({{SALARIO_LETRA}}). El salario deberá pagarse en moneda de curso legal y en el lugar convenido. <span class="art-ref">(Arts. 82 a 89, Ley Federal del Trabajo — salario: definición, determinación y forma de pago)</span></div>

<div class="clause"><span class="clause-title">QUINTA. DURACIÓN DE LA RELACIÓN LABORAL.</span> La relación laboral objeto del presente contrato es por TIEMPO {{PLAZO_CONTRATO}}, iniciando el día <strong>{{FECHA_INICIO_TEXTO}}</strong>, y permanecerá vigente mientras subsista la relación de trabajo {{TEXTO_FIN_PLAZO}}, sin perjuicio de las causas de terminación o rescisión previstas por la legislación aplicable. <span class="art-ref">(Arts. 35 a 42, Ley Federal del Trabajo — contratos por tiempo determinado, indeterminado o para obra determinada)</span></div>

<div class="clause"><span class="clause-title">SEXTA. PERÍODO DE CAPACITACIÓN INICIAL.</span> "EL TRABAJADOR" estará sujeto a un período de capacitación inicial de tres meses, durante el cual será evaluado respecto de la suficiencia, conocimientos, habilidades, aptitudes y competencia necesarios para desempeñar adecuadamente las funciones correspondientes al puesto para el cual ha sido contratado. El período de capacitación inicial será improrrogable y el tiempo transcurrido durante el mismo será considerado para efectos de antigüedad. <span class="art-ref">(Art. 39, Ley Federal del Trabajo — periodo de prueba, incapacidad inicial y capacitación inicial; máx. 3 meses)</span></div>

<div class="clause"><span class="clause-title">SÉPTIMA. JORNADA Y HORARIO.</span> "EL TRABAJADOR" prestará sus servicios conforme al siguiente horario: <strong>{{HORARIO}}</strong>. La jornada máxima de trabajo diurno no excederá de ocho horas. El horario podrá modificarse por necesidades de la institución, de acuerdo con las disposiciones aplicables y el Reglamento Interior de Trabajo. <span class="art-ref">(Arts. 58 a 65, Ley Federal del Trabajo — jornada máxima de trabajo: 8 hrs diurna, 7.5 hrs mixta, 7 hrs nocturna)</span></div>

<div class="clause"><span class="clause-title">OCTAVA. REGISTRO DE ASISTENCIA.</span> "EL TRABAJADOR" deberá registrar su entrada y salida mediante el sistema que determine "EL PATRÓN". El patrón estará obligado a llevar un registro de control de asistencia. Se observarán las disposiciones del Reglamento Interior de Trabajo respecto de tolerancias, retardos, faltas y justificantes. <span class="art-ref">(Art. 82, Ley Federal del Trabajo — obligación del patrón de llevar registros y entregar copias al trabajador)</span></div>

<div class="clause"><span class="clause-title">NOVENA. TIEMPO EXTRAORDINARIO.</span> Se considerará tiempo extraordinario aquel que se labore fuera de la jornada asignada cuando exista indicación o autorización de "EL PATRÓN" o del superior correspondiente. El trabajo extraordinario no podrá exceder de nueve horas diarias ni de tres veces por semana. <span class="art-ref">(Arts. 66 a 68, Ley Federal del Trabajo — horas extra: máx. 3 hrs/día, 9 hrs/semana; primeras 9 hrs/semana dobles, excedente triple)</span></div>

<div class="clause"><span class="clause-title">DÉCIMA. DÍAS DE DESCANSO.</span> "EL TRABAJADOR" tendrá derecho a un día de descanso por cada seis días de trabajo, el cual será pagado con el ciento por ciento del salario que le corresponda a la semana. Asimismo, tendrá derecho a los días de descanso obligatorio establecidos en el artículo 74 de la Ley Federal del Trabajo. <span class="art-ref">(Arts. 69 a 74, Ley Federal del Trabajo — descanso semanal obligatorio y días festivos)</span></div>

<div class="clause"><span class="clause-title">DÉCIMA PRIMERA. VACACIONES Y PRIMA VACACIONAL.</span> "EL TRABAJADOR" tendrá derecho a un periodo anual de vacaciones pagadas de conformidad con lo siguiente: doce días laborables al concluir el primer año de servicios; por cada año subsecuente, dos días adicionales hasta llegar a veinte días; a partir del sexto año, dos días por cada cinco años de servicios. Además, recibirá una prima vacacional no menor del veinticinco por ciento sobre los salarios que le correspondan durante el periodo de vacaciones. <span class="art-ref">(Arts. 76 a 81, Ley Federal del Trabajo — vacaciones progresivas: 12 a 20 días + prima vacacional mín. 25%)</span></div>

<div class="clause"><span class="clause-title">DÉCIMA SEGUNDA. AGUINALDO.</span> "EL PATRÓN" cubrirá a "EL TRABAJADOR" un aguinaldo anual equivalente a quince días de salario, el cual deberá pagarse antes del día veinte de diciembre. Cuando el trabajador no haya laborado todo el año, el aguinaldo se pagará de manera proporcional. <span class="art-ref">(Art. 87, Ley Federal del Trabajo — aguinaldo mínimo de 15 días de salario)</span></div>

<div class="clause"><span class="clause-title">DÉCIMA TERCERA. OBLIGACIONES DEL TRABAJADOR.</span> "EL TRABAJADOR" se obliga a: 1) Cumplir las funciones de su puesto con diligencia y eficiencia; 2) Cumplir con el Reglamento Interior de Trabajo; 3) Registrar correctamente sus entradas y salidas; 4) Mantener una conducta respetuosa hacia sus superiores y compañeros; 5) Utilizar adecuadamente los equipos y materiales proporcionados; 6) Mantener la confidencialidad de la información; 7) Asistir a las capacitaciones obligatorias; 8) Cumplir las medidas de seguridad e higiene en el trabajo. <span class="art-ref">(Art. 5, fracción III, Ley Federal del Trabajo — obligaciones generales de los trabajadores)</span></div>

<div class="clause"><span class="clause-title">DÉCIMA CUARTA. CONFIDENCIALIDAD.</span> "EL TRABAJADOR" se obliga a guardar absoluta confidencialidad respecto de la información administrativa, financiera, laboral y cualquier otra información a la que tenga acceso con motivo de sus funciones. Queda prohibido revelar, copiar, divulgar o utilizar dicha información para beneficio propio o de terceros sin autorización. <span class="art-ref">(Art. 20, Ley Federal del Trabajo — obligación de guarda de reserva de información del patrón)</span></div>

<div class="clause"><span class="clause-title">DÉCIMA QUINTA. PROHIBICIONES.</span> Queda prohibido al trabajador: faltar injustificadamente o con retraso habitual e injustificado a su trabajo; utilizar indebidamente los equipos; sustraer bienes de la institución; presentarse bajo los efectos de alcohol o sustancias prohibidas; realizar actos de violencia, acoso u hostigamiento; revelar información confidencial. <span class="art-ref">(Art. 47, Ley Federal del Trabajo — causas de rescisión sin responsabilidad para el patrón)</span></div>

<div class="clause"><span class="clause-title">DÉCIMA SEXTA. CAPACITACIÓN.</span> "EL PATRÓN" proporcionará la capacitación que corresponda conforme a los planes y programas establecidos. "EL TRABAJADOR" se obliga a asistir a los cursos y entrenamientos que tengan carácter obligatorio. <span class="art-ref">(Arts. 153 a 154, Ley Federal del Trabajo — obligación de capacitación del patrón)</span></div>

<div class="clause"><span class="clause-title">DÉCIMA SÉPTIMA. SEGURIDAD E HIGIENE.</span> "EL TRABAJADOR" deberá cumplir las medidas preventivas y de seguridad en el trabajo que determine el patrón, de acuerdo con las normas de seguridad e higiene, y las disposiciones aplicables de las autoridades competentes. <span class="art-ref">(Art. 52, Ley Federal del Trabajo — obligación del patrón de prestar atención médica y prevenir riesgos)</span></div>

<div class="clause"><span class="clause-title">DÉCIMA OCTAVA. SANCIONES.</span> El incumplimiento del Reglamento Interior de Trabajo podrá dar lugar a las medidas disciplinarias correspondientes, incluyendo amonestaciones, llamadas de atención, suspensiones o, cuando legalmente corresponda, rescisión de la relación laboral. <span class="art-ref">(Art. 424, Ley Federal del Trabajo — sanciones disciplinarias; Art. 47 — rescisión por incumplimiento del reglamento)</span></div>

<div class="clause"><span class="clause-title">DÉCIMA NOVENA. TERMINACIÓN Y RESCISIÓN.</span> La relación laboral podrá terminar o rescindirse por las causas previstas en los artículos 33, 43, 46, 47, 48, 50, 51, 53, 55, 56 y 59 de la Ley Federal del Trabajo. <span class="art-ref">(Arts. 33, 43, 46 a 59, Ley Federal del Trabajo — causales de terminación, rescisión y liquidación)</span></div>

<div class="clause"><span class="clause-title">VIGÉSIMA. REGLAMENTO INTERIOR.</span> "EL TRABAJADOR" manifiesta conocer y aceptar el Reglamento Interior de Trabajo vigente en "EL PATRÓN", obligándose a cumplirlo durante toda la relación laboral. <span class="art-ref">(Art. 424, Ley Federal del Trabajo — contenido y carácter obligatorio del Reglamento Interior de Trabajo)</span></div>

<div class="clause"><span class="clause-title">VIGÉSIMA PRIMERA. LEGISLACIÓN APLICABLE.</span> Para todo lo no previsto en el presente contrato serán aplicables las disposiciones de la Ley Federal del Trabajo, la Ley del Seguro Social, la Ley del Instituto del Fondo Nacional de la Vivienda para los Trabajadores, el Reglamento Interior de Trabajo y demás disposiciones aplicables. <span class="art-ref">(Art. 3, Ley Federal del Trabajo — jerarquía normativa laboral)</span></div>

<p style="text-align:justify;margin-top:20px">Leído que fue el presente contrato y enteradas ambas partes de su contenido y alcance, lo firman por duplicado en <strong>{{CIUDAD_ORG}}</strong>, el día <strong>{{FECHA_INICIO_TEXTO}}</strong>, fecha de inicio de la relación laboral.</p>

<div class="signature-section">
  <div>
    <div class="sig-line">"EL PATRÓN"</div>
    <div style="margin-top:4px;font-size:11px">{{TIPO_PATRON_LEGAL}}</div>
    <div style="font-size:10px;color:#666">{{REPRESENTANTE_LEGAL}}</div>
  </div>
  <div>
    <div class="sig-line">"EL TRABAJADOR"</div>
    <div style="margin-top:4px;font-size:11px">Nombre: {{NOMBRE_COMPLETO}}</div>
  </div>
</div>

<div class="signature-section" style="margin-top:20px">
  <div>
    <div class="sig-line">TESTIGO 1</div>
    <div style="margin-top:4px;font-size:11px">{{NOMBRE_TESTIGO_1}}</div>
  </div>
  <div>
    <div class="sig-line">TESTIGO 2</div>
    <div style="margin-top:4px;font-size:11px">{{NOMBRE_TESTIGO_2}}</div>
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
  .art-ref { font-style: italic; color: #555; font-size: 10px; }
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
  El presente Reglamento Interior de Trabajo ha sido formulado de común acuerdo por una Comisión Mixta integrada por representantes de los trabajadores y del patrón, de conformidad con el artículo 424, fracción I, de la Ley Federal del Trabajo. <span class="art-ref">(Art. 424 LFT — obligatoriedad para centros de trabajo con más de 20 trabajadores)</span>
</p>
<p style="text-align:justify;margin-bottom:16px;font-size:10px;color:#555">
  Fecha de entrada en vigor: {{FECHA_ACTUAL}}
</p>

<div class="clause">
  <span class="clause-num">PRIMERA. Lugar de trabajo.</span>
  El trabajador iniciará y terminará las labores designadas en el domicilio del centro de trabajo ubicado en <strong>{{DOMICILIO}}</strong>, o en aquellos lugares a los que sea comisionado por necesidades de la institución. El patrón estará obligado a prestar los medicamentos, reinstalar los equipos y adoptar las medidas que las autoridades sanitarias determinen. <span class="art-ref">(Art. 82 LFT — lugar convenido para la prestación de servicios; Art. 52 LFT — obligación del patrón de prestar atención médica)</span>
</div>

<div class="clause">
  <span class="clause-num">SEGUNDA. Jornada de trabajo.</span>
  La jornada máxima de trabajo será la que acuerden las partes. En caso de que no hubiere acuerdo, la jornada máxima será: diurna de ocho horas; nocturna de siete horas; mixta de siete horas y media. Se considerará jornada diurna la que se celebre entre las seis y las veinte horas; nocturna la que se celebre entre las veinte y las seis horas; mixta la que comprenda période tanto diurnas como nocturnas. <span class="art-ref">(Arts. 58 a 65 LFT — jornadas máximas: 8 hrs diurna, 7 hrs nocturna, 7.5 hrs mixta)</span>
</div>

<div class="clause">
  <span class="clause-num">TERCERA. Horario de trabajo.</span>
  De acuerdo con el puesto que desempeña:<br/>
  • <strong>Personal Administrativo:</strong> Lunes a viernes de 9:00 a 18:00 hrs, con hora de comida de 15:00 a 16:00 hrs; sábados de 9:00 a 14:00 hrs.<br/>
  • <strong>Personal Operativo:</strong> De acuerdo a las necesidades de la empresa y bajo autorización de la dirección.<br/>
  La jornada laboral deberá ser prestada de forma eficiente, evitando cualquier pérdida de tiempo o distracción personal. <span class="art-ref">(Art. 60 LFT — obligación del patrón de informar al trabajador sobre jornada, descansos y salario; Art. 82 LFT — lugar y horario convenidos)</span>
</div>

<div class="clause">
  <span class="clause-num">CUARTA. Tiempo extraordinario.</span>
  El trabajo extraordinario no podrá exceder de nueve horas diarias ni de tres veces por semana, y deberá pagarse con un ciento por ciento más del salario fijado para la jornada ordinaria. Las primeras nueve horas extraordinarias que se laboren en la semana deberán pagarse con un ciento por ciento más del salario normal; por las horas excedentes se pagará un ciento por ciento más del salario de las horas dobles. <span class="art-ref">(Arts. 66 a 68 LFT — horas extra: máx. 9 hrs/día, 3 veces/semana; primeras 9 hrs/semana al 100%, excedente al 200%)</span>
</div>

<div class="clause">
  <span class="clause-num">QUINTA. Días de descanso.</span>
  Los trabajadores que laboren en forma ininterrumpida tendrán derecho a un día de descanso por cada seis días de trabajo, con goce de salario integro. Los días de descanso obligatorio serán los que establezca la legislación vigente. <span class="art-ref">(Arts. 69 a 74 LFT — descanso semanal obligatorio; días festivos: 1 de enero, primer lunes de febrero, tercer lunes de marzo, 1 de mayo, 16 de septiembre, tercer lunes de noviembre, 25 de diciembre)</span>
</div>

<div class="clause">
  <span class="clause-num">SEXTA. Asistencia y puntualidad.</span>
  Los trabajadores deberán presentarse puntualmente a sus labores. Se darán 10 minutos de tolerancia a todos los empleados en la hora de entrada. Después del minuto 11 se considerará como un RETARDO MENOR; después del minuto 16 se considera un RETARDO MAYOR; después del minuto 21 solo podrá ingresar previa autorización por escrito de su jefe inmediato.<br/><br/>
  Acumulando 3 retardos menores en la quincena se hará acreedor a un llamado de atención por escrito. Acumulando 2 retardos mayores en la quincena se hará acreedor a un llamado de atención por escrito.<br/><br/>
  Contar con 3 faltas injustificadas en un periodo de 30 días será motivo de rescisión de contrato. <span class="art-ref">(Art. 47, fracción II, LFT — causales de rescisión: inasistencias injustificadas 3 veces en 30 días; Art. 60 LFT — obligación de llevar registro de asistencia)</span>
</div>

<div class="clause">
  <span class="clause-num">SÉPTIMA. Vacaciones.</span>
  Los trabajadores que tengan más de un año de servicios disfrutarán de un periodo anual de vacaciones pagadas no inferior a doce días laborables. Dicho periodo aumentará en dos días laborables por cada año subsecuente hasta llegar a veinte días y, a partir del sexto año, aumentará en dos días por cada cinco años de servicios. <span class="art-ref">(Art. 76 LFT — vacaciones progresivas: 12 días primer año + 2 días por año hasta llegar a 20; a partir del 6° año, 2 días por cada 5 años)</span>
</div>

<div class="clause">
  <span class="clause-num">OCTAVA. Prima vacacional.</span>
  El trabajador que disfrute de vacaciones tendrá derecho a una prima no menor del veinticinco por ciento sobre los salarios que le correspondan durante el periodo de vacaciones. <span class="art-ref">(Art. 80 LFT — prima vacacional mínima del 25%)</span>
</div>

<div class="clause">
  <span class="clause-num">NOVENA. Aguinaldo.</span>
  Los trabajadores tendrán derecho a un aguinaldo anual que será no menor de quince días de salario, el cual deberá pagarse antes del día veinte de diciembre. Cuando el trabajador no haya laborado todo el año, el aguinaldo se pagará de manera proporcional. <span class="art-ref">(Art. 87 LFT — aguinaldo mínimo de 15 días de salario)</span>
</div>

<div class="clause">
  <span class="clause-num">DÉCIMA. Prima dominical.</span>
  Los trabajadores que presten servicios los domingos tendrán derecho a una prima adicional del veinticinco por ciento sobre el salario de los días ordinarios de trabajo. <span class="art-ref">(Art. 71 LFT — prima dominical mínima del 25%)</span>
</div>

<div class="clause">
  <span class="clause-num">DÉCIMA PRIMERA. Salario.</span>
  El salario se pagará en moneda de curso legal y en el lugar convenido. El patrón deberá entregar al trabajador un recibo de pago especificando el salario, percepciones y deducciones. <span class="art-ref">(Arts. 82 a 89 LFT — pago del salario en moneda de curso legal; Art. 83 — prohibición de pagar en mercancías, vales o tokens)</span>
</div>

<div class="clause">
  <span class="clause-num">DÉCIMA SEGUNDA. Definición de labores.</span>
  Cada uno de los colaboradores deberá cumplir con su definición de labores y se hará acreedor a las sanciones reglamentarias en caso de no cumplir con las actividades encomendadas por su jefe inmediato. <span class="art-ref">(Art. 5, fracción III, LFT — obligación de cumplir con las condiciones de trabajo)</span>
</div>

<div class="clause">
  <span class="clause-num">DÉCIMA TERCERA. Actividades del puesto — Auxiliar de Almacén.</span>
  El Auxiliar de Almacén deberá desempeñar las siguientes actividades principales:<br/><br/>
  <strong>a) Organización de almacén:</strong> Asegurar que los productos estén almacenados de forma lógica y accesible, optimizando el uso del espacio.<br/>
  <strong>b) Preparación de pedidos:</strong> Seleccionar los productos correctos antes de su entrega al vendedor.<br/>
  <strong>c) Control de inventarios:</strong> Participar en la toma de inventarios para asegurar que las existencias físicas coincidan con los registros en el sistema.<br/>
  <strong>d) Carga y descarga de mercancías:</strong> Realizar la carga y descarga de productos con la debida manipulación para evitar daños.<br/>
  <strong>e) Optimización del espacio de almacén:</strong> Reorganizar productos y ajustar posiciones según las necesidades de la empresa.<br/>
  <strong>f) Mantenimiento del orden y limpieza:</strong> Mantener el almacén limpio y ordenado para garantizar la seguridad y facilitar la localización de productos.<br/>
  <strong>g) Atención al cliente:</strong> Apoyar en mostrar las piezas al cliente para verificar su estado.<br/>
  <strong>h) Recepción de material:</strong> Apoyar en la revisión y recepción de material.<br/>
  <strong>i) Demás actividades:</strong> Aquellas que le sean asignadas por su jefe inmediato, las cuales deberán ser dentro de su horario de trabajo. <span class="art-ref">(Art. 5, fracción I, LFT — obligación de cumplir con las condiciones de trabajo; Art. 60 LFT — obligación del patrón de informar sobre funciones)</span>
</div>

<div class="clause">
  <span class="clause-num">DÉCIMA CUARTA. Obligaciones de los trabajadores.</span>
  El personal deberá: cumplir con las condiciones de trabajo; dirigirse con sus jefes inmediatos para aclaración de dudas; portar vestimenta adecuada al puesto; evitar distracciones dentro del horario laboral; utilizar lenguaje formal, respetuoso y no discriminatorio; asistir a cursos obligatorios; utilizar adecuadamente los equipos proporcionados; mantener la confidencialidad de la información. <span class="art-ref">(Art. 5, fracciones I a VIII, LFT — obligaciones generales de los trabajadores)</span>
</div>

<div class="clause">
  <span class="clause-num">DÉCIMA QUINTA. Prohibiciones.</span>
  Está prohibido al personal: ejecutar actos que pongan en peligro su seguridad o la de terceros; faltar al trabajo sin causa justificada; substraer materiales o útiles de la empresa; presentarse en estado de embriaguez o bajo influencia de sustancias; hacer propaganda en horas de trabajo; acosar sexualmente a cualquier persona; revelar información confidencial. <span class="art-ref">(Art. 47, fracciones I a VII, LFT — causales de rescisión sin responsabilidad para el patrón)</span>
</div>

<div class="clause">
  <span class="clause-num">DÉCIMA SEXTA. Sanciones administrativas.</span>
  La empresa podrá sancionar a sus trabajadores, amonestándolos o suspendiéndolos, respetando en todo momento el derecho del trabajador a ser oído antes de la aplicación de cualquier sanción. La suspensión como medida disciplinaria no podrá exceder de ocho días y no se impondrán multas a los trabajadores.<br/><br/>
  <strong>Procedimiento:</strong><br/>
  1) Amonestación verbal (máximo 3 eventos)<br/>
  2) Llamado de atención por escrito<br/>
  3) Suspensión sin goce de sueldo (máximo 8 días)<br/>
  4) Rescisión de contrato <span class="art-ref">(Art. 87 Reglamento Federal de Seguridad, Higiene y Medio Ambiente de Trabajo — procedimiento disciplinario; Art. 47 LFT — causales de rescisión)</span>
</div>

<div class="clause">
  <span class="clause-num">DÉCIMA SÉPTIMA. Trabajo libre de violencia, con igualdad y sin discriminación.</span>
  En esta fuente laboral los trabajadores deberán desempeñar sus tareas en un ambiente libre de violencia e igualdad. Se debe evitar el acoso o mobbing entre compañeros, la discriminación laboral por origen étnico, nacionalidad, género, edad, discapacidad, condición social, religión, preferencia sexual u opinión. El patrón está obligado a fomentar un ambiente de trabajo libre de violencia y discriminación. <span class="art-ref">(Art. 2 LFT — principios de igualdad y no discriminación; Art. 3 Bis LFT — prevención y sanción del hostigamiento y acoso)</span>
</div>

<div class="clause">
  <span class="clause-num">DÉCIMA OCTAVA. Seguridad e higiene.</span>
  El patrón estará obligado a prestar atención médica preventiva a los trabajadores, así como a cumplir con las disposiciones de seguridad e higiene que establezcan las normas oficiales. Los trabajadores deberán cumplir las medidas preventivas y de seguridad en el trabajo que determine el patrón. <span class="art-ref">(Art. 52 LFT — obligación del patrón de prestar atención médica y prevenir riesgos; Art. 55 LFT — constancias de capacITACIÓN en materia de seguridad)</span>
</div>

<div class="clause">
  <span class="clause-num">DÉCIMA NOVENA. Registro de asistencia.</span>
  El patrón llevará un registro de control de asistencia que contendrá la fecha y hora de entrada y salida de los trabajadores. El patrón deberá entregar al trabajador una copia del registro en cada pago. <span class="art-ref">(Art. 82 LFT — obligación del patrón de llevar registros y entregar copias al trabajador)</span>
</div>

<div class="clause">
  <span class="clause-num">VIGÉSIMA. Protección de datos personales.</span>
  El patrón deberá proteger los datos personales de los trabajadores conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares. Queda prohibido el uso indebido de la información personal de los trabajadores. <span class="art-ref">(Ley Federal de Protección de Datos Personales en Posesión de los Particulares; Art. 20 LFT — obligación de guarda de reserva)</span>
</div>

<div class="clause">
  <span class="clause-num">VIGÉSIMA PRIMERA. Terminación y rescisión.</span>
  La relación laboral podrá terminar por mutuo acuerdo, por muerte del trabajador, por incapacidad total o permanente, por fuerza mayor o caso fortuito, por liquidación del establecimiento, o por las causas previstas en los artículos 43, 46, 47, 50, 51, 53, 55, 56 y 59 de la Ley Federal del Trabajo. <span class="art-ref">(Arts. 33, 43, 46 a 59 LFT — causales de terminación, rescisión y liquidación)</span>
</div>

<div class="clause">
  <span class="clause-num">VIGÉSIMA SEGUNDA. Prescripción de acciones.</span>
  Las acciones de los trabajadores derivadas de la relación de trabajo prescribirán en un año contado a partir del día en que pudieron ejercerlas. Las acciones del patrón prescribirán en un año. <span class="art-ref">(Art. 113 LFT — prescripción de acciones laborales: 1 año)</span>
</div>

<div class="clause">
  <span class="clause-num">VIGÉSIMA TERCERA. Legislación aplicable.</span>
  Para todo lo no previsto en el presente reglamento serán aplicables las disposiciones de la Ley Federal del Trabajo, la Ley del Seguro Social, el Reglamento Federal de Seguridad, Higiene y Medio Ambiente de Trabajo, y demás disposiciones aplicables. <span class="art-ref">(Art. 3 LFT — jerarquía normativa laboral; Art. 424 LFT — contenido mínimo del RIT)</span>
</div>

<p style="text-align:justify;margin-top:20px">
  En caso de incumplimiento con el presente Reglamento Interior de Trabajo, será motivo de las sanciones administrativas correspondientes y, en su caso, de la rescisión de la relación laboral sin responsabilidad para el patrón, conforme a los artículos 47 y 424 de la Ley Federal del Trabajo.
</p>

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
