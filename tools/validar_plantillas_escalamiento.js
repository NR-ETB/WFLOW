const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const secondLevelFields = [
  'USUARIO',
  'CANAL',
  'TIPO DE FALLA',
  'IMEI',
  'MODELO / MARCA / EQUIPO',
  'BLOQUEO',
  'NOMBRE',
  'CC / CÉDULA',
  'LÍNEA',
  'CONTACTO',
  'CIUDAD',
  'BARRIO',
  'CHARGING',
  'SAAW',
];

const qrExpiredFields = [
  'Fecha de expedición de la cédula',
  'Número de línea',
  'Descripción del error o inconveniente presentado',
  'Observación (indicar claramente la solución requerida o el resultado esperado para el cierre del caso)',
  'Número de contacto',
  'Sistema operativo del dispositivo (iOS o Android)',
];

const synchronizationFields = [
  'Fecha de expedición de la cédula',
  'Email del cliente',
  'Número de cuenta de facturación',
  'Error presentado',
  'Observación (Solución requerida)',
  'Número de contacto',
];

const workflows = [
  {
    file: 'Ningun Servicio Funciona - 1.json',
    forms: {
      'Form Escalar GESTFAC': secondLevelFields,
      'Form Escalar Gestor': synchronizationFields,
    },
  },
  {
    file: 'Ningun Servicio Funciona - 2.json',
    forms: {
      'Form Escalar Gestor QR': qrExpiredFields,
      'Form Escalar Gestor NIP': secondLevelFields,
      'Form Escalar Gestor SUMA': synchronizationFields,
    },
  },
  {
    file: 'Ningun Servicio Funciona - 3.json',
    forms: { 'Form Escalar Segundo Nivel': secondLevelFields },
  },
];

const errors = [];
let verified = 0;

for (const definition of workflows) {
  const workflow = JSON.parse(fs.readFileSync(path.join(root, definition.file), 'utf8'));
  for (const [formName, expectedFields] of Object.entries(definition.forms)) {
    const node = workflow.nodes.find((candidate) => candidate.name === formName);
    if (!node) {
      errors.push(`${definition.file}: falta ${formName}`);
      continue;
    }

    const code = node.parameters?.jsCode || '';
    const match = code.match(/^const cfg = (\{.*\});$/m);
    if (!match) {
      errors.push(`${formName}: no expone una configuración verificable`);
      continue;
    }

    const cfg = JSON.parse(match[1]);
    if (JSON.stringify(cfg.escalationTemplate) !== JSON.stringify(expectedFields)) {
      errors.push(`${formName}: la plantilla configurada no coincide con la plantilla operativa`);
    }
    if (!code.includes('copyEscalationTemplate')) {
      errors.push(`${formName}: falta la función para copiar la plantilla`);
    }

    try {
      const result = new Function('$execution', '$json', code)(
        {
          id: 'escalation-template-test',
          mode: 'production',
          resumeUrl: 'https://n8n.example.test/webhook-waiting/escalation-template-test',
        },
        { query: { workflow_session: 'session-template-test', tipo_sim: 'eSIM' } },
      );
      const html = result?.[0]?.json?.html_response || '';
      for (const marker of [
        'Ver plantilla de escalamiento',
        'Copiar plantilla',
        `${expectedFields[0]}:`,
        `${expectedFields[expectedFields.length - 1]}:`,
      ]) {
        if (!html.includes(marker)) errors.push(`${formName}: el HTML no muestra ${marker}`);
      }
      verified += 1;
    } catch (error) {
      errors.push(`${formName}: JavaScript inválido (${error.message})`);
    }
  }
}

if (errors.length) {
  console.error('VALIDACIÓN DE PLANTILLAS FALLIDA');
  for (const error of errors) console.error(`✗ ${error}`);
  process.exit(1);
}

console.log(`VALIDACIÓN DE PLANTILLAS OK: ${verified} pantallas de escalamiento verificadas.`);
