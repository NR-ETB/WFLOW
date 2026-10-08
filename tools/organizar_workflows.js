// Organización reproducible: cada nodo pertenece a un bloque documentado.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const group = (title, purpose, rule, pattern) => ({ title, purpose, rule, pattern });
const definitions = [
  [
    group('Apertura del registro', 'Entrada GET sin parámetros. Genera la referencia de la gestión y muestra los tres campos.', 'Usuario del asesor, conexión y PQR son texto; no se solicita contraseña.', /^(Abrir Flujo 0|Formulario Inicial|Mostrar Formulario Inicial)$/),
    group('Recepción y validación', 'Recibe POST, valida campos y conserva la referencia en los reintentos.', 'Los tres campos son obligatorios; máximo 100 caracteres. Entradas inválidas reciben HTTP 422.', /^(Recibir Datos Iniciales|Validar Datos Iniciales|IF Datos Iniciales Validos|Formulario Datos Invalidos|Mostrar Datos Invalidos)$/),
    group('Guardado y continuidad', 'Registra cabecera y log en una sola operación PostgreSQL. Confirma los valores originales guardados.', 'Solo se permite continuar al diagnóstico después de recibir la confirmación de la base.', /^(Preparar Registro Inicial SQL|Guardar Registro Inicial PostgreSQL|Confirmar Registro Inicial|Mostrar Registro Completado)$/),
    group('Reintento seguro', 'Conserva los campos y la referencia si la base no confirma el guardado.', 'No se muestra el error técnico al asesor ni se inventa un resultado exitoso.', /^(Preparar Reintento Registro|Formulario Reintento Registro|Mostrar Reintento Registro)$/),
  ],
  [
    group('Entrada común y sesión', 'Verifica cabecera y log del flujo 0 antes de abrir el diagnóstico o recibir el handoff.', 'Sin registro inicial confirmado se vuelve al flujo 0. Los datos iniciales no viajan en la URL.', /^(Apertura del Flujo|Continuar a Etapa 2|Normalizar Inicio|Consultar Registro Inicial|IF Registro Inicial|Conservar Sesion Inicial|Volver a Flujo 0|Preparar Error Inicio|Responder Error Inicio|IF Entrada Handoff Valida|Responder Handoff Invalido)/),
    group('Línea y cobertura', 'Comprueba el estado de la línea, la cobertura ETB y la condición de viaje.', 'Abrir el mapa oficial es obligatorio para continuar; registrar cobertura y viaje.', /(Verificar Linea|linea_activa|Validar Cobertura y Viaje)/),
    group('Pagos y GESTFAC', 'Valida pagos o registra el escalamiento GESTFAC antes de seguir.', 'Reconexión cuando corresponde; no confirmar una gestión pendiente como realizada.', /(Confirmar Pago|pago_al_dia|Escalar GESTFAC)/),
    group('ICCID y sincronización', 'Valida o confirma el ICCID; inconsistencias se escalan al gestor de sincronización.', 'La plantilla de sincronización es específica, no la plantilla técnica.', /(ICCID|iccid_|Escalar Gestor)/),
    group('IMEI y bloqueo', 'Valida IMEI, registro público y bloqueos. Las salidas documentales evitan pasos técnicos improcedentes.', 'Abrir consulta pública de IMEI es obligatorio; IMEI inválido deriva a documentación.', /(IMEI|registro_imei_ok|Verificar Bloqueo|bloqueado)/),
    group('Documentación y tipo de SIM', 'Registra el canal documental o identifica SIM física/eSIM para el diagnóstico.', 'Únicamente SIM física y eSIM. Tipo de SIM usa handoff estable, no Wait consumido.', /(Enviar Doc|Tipo SIM)/),
    group('Persistencia y salida', 'Guarda la etapa 1 en el log general y después responde o redirige a etapa 2.', 'UPSERT por sesión, flujo, etapa e intento. Los errores permanecen en la ejecución.', /(Preparar Registro SQL|Guardar Respuestas|Confirmar Guardado|Continuar Etapa 2|Redirigir a Etapa 2|Responder Cierre Etapa 1|Guardado Pendiente)/),
  ],
  [
    group('Entrada y continuidad', 'Recupera la etapa 1 y normaliza accesos directos o handoff estable.', 'La cabecera debe existir. La sesión nunca se genera aquí; se conserva desde flujo 0.', /^(Apertura Etapa 2|Continuar directamente|Normalizar |Consultar Contexto|IF Contexto|IF Entrada|Preparar Contexto|Preparar Handoff|HTML Contexto|Responder Contexto)/),
    group('SIM y QR', 'Distingue SIM física/eSIM; registra instalación, reutilización o escalamiento del QR.', 'QR sin funcionar después de 24 horas usa su plantilla específica. Después del escaneo se verifica el servicio.', /(Tipo SIM|Gestionar QR|QR Cumplio|Gestor QR|Funcionalidad Post QR|Servicio Post QR)/),
    group('Portación y estado NIP', 'Valida si la línea está portada y si la portación se completó; consulta el estado del NIP.', 'NIP recibido o pendiente se escala a CRM BAM; NIP vencido requiere nueva gestión de venta.', /(Linea Portada|Verificar Portacion|Portacion Completada|Estado NIP|NIP Recibido|NIP Vencido)/),
    group('Escalamiento por aliado', 'Registra escalamiento CRM BAM o nueva venta por vencimiento del NIP.', 'Sin plantilla. Konecta: formulario. COS: Soul. Confirmar únicamente que se escaló el caso.', /(Escalar CRM BAM|Escalar Gestor NIP)/),
    group('Recursos SUMA y cierre', 'Pospago/prepago con recursos continúa al equipo. Prepago sin recursos muestra cierre específico.', 'No aplica falla si faltan datos, minutos o SMS necesarios. Cierre mediante webhook estable.', /(Validar SUMA|SUMA Activo|Cierre Sin Recursos|Mostrar Cierre Sin Recursos)/),
    group('Persistencia y respuesta', 'Guarda la etapa 2 antes de cerrar o redirigir al diagnóstico del equipo.', 'Errores controlados permiten reintentar con la misma sesión. No reutilizar un Wait finalizado.', /(Preparar Registro Etapa 2|Guardar Etapa 2|Confirmar Guardado|Continuar Etapa 3|Redirigir a Etapa 3|Cierre Etapa 2|Persistencia Etapa 2)/),
  ],
  [
    group('Entrada y contexto', 'Consulta el resultado de SUMA y la etapa 2 antes de abrir el soporte técnico.', 'Solo recursos pospago/prepago disponibles permiten esta etapa. Conserva la sesión inicial.', /^(Apertura Etapa 3|Normalizar Entrada|Consultar Contexto|IF Contexto|Preparar Contexto|HTML Contexto|Responder Contexto)/),
    group('Falla y configuración', 'Identifica falla, equipo y sistema; guía la configuración en la plataforma correspondiente.', 'SMS usa la ruta de llamadas. Abrir el enlace de configuración es obligatorio cuando aplica.', /(Verificar Configuracion|Falla Datos|Confirmar Equipo Cliente|Configurar Equipo|Resultado Configuracion|Configuracion Funciono)/),
    group('Prueba cruzada física', 'Valida disponibilidad de otro dispositivo y prueba la SIM física.', 'eSIM omite la prueba cruzada. Registrar el resultado sin asumir una solución.', /(Dispositivo Alterno|Alterno Desde|Prueba Cruzada|Antes de Prueba Cruzada)/),
    group('Reinicio y diagnóstico', 'Guía reinicio y verifica recuperación del servicio.', 'eSIM: modo avión, apagar 20 segundos y encender. No retirar una eSIM.', /(Reiniciar y Reinsertar|Reinicio Funciono|Volver Reinicio)/),
    group('Resultados técnicos', 'Confirma solución por configuración, dispositivo o reinicio; registra escalamiento a segundo nivel.', 'Segundo nivel usa su plantilla técnica de 14 campos. No incluir datos personales ficticios.', /(PQR Solucionada|Escalar Segundo Nivel)/),
    group('Log técnico y resumen', 'Guarda el resultado técnico pendiente de cierre y presenta el resumen de esta sesión.', 'El resumen incluye los datos iniciales originales. Las observaciones son obligatorias: 10–2000 caracteres.', /(Preparar Registro Etapa 3|Guardar Etapa 3|Confirmar Guardado|Consultar Resumen|Verificar Resumen|Form Resumen|Enviar Resumen|Espera Observaciones)/),
    group('Cierre confirmado y contingencia', 'Guarda observaciones y confirma el cierre únicamente después de persistir.', 'Error técnico solo en ejecución. Las etapas guardadas se conservan; no afirmar un cierre no confirmado.', /(Preparar Observaciones|Guardar Observaciones|Confirmar Observaciones|HTML Cierre Definitivo|Responder Cierre Etapa 3|Guardado Pendiente)/),
  ],
];
function organize(workflow, stage) {
  const nodes = workflow.nodes.filter(n => n.type !== 'n8n-nodes-base.stickyNote');
  const groups = definitions[stage].map(g => ({ ...g, nodes: [] }));
  const owner = new Map();
  for (const node of nodes) {
    const matches = groups.filter(g => g.pattern.test(node.name));
    if (matches.length !== 1) throw new Error(`Bloque ambiguo o ausente: ${node.name} (${matches.length})`);
    matches[0].nodes.push(node); owner.set(node.name, matches[0]);
  }
  // Mantener cada cadena próxima: formulario, respuesta, Wait, decisión.
  // Los retornos ya visitados no alteran el orden ni producen bucles de layout.
  for (const g of groups) {
    const members = new Map(g.nodes.map(n => [n.name, n]));
    const localIncoming = new Set();
    const externalIncoming = new Set();
    for (const [source, outputs] of Object.entries(workflow.connections)) {
      for (const edge of (outputs.main || []).flat()) if (members.has(edge.node)) {
        (members.has(source) ? localIncoming : externalIncoming).add(edge.node);
      }
    }
    const starts = g.nodes.filter(n => n.type === 'n8n-nodes-base.webhook' ||
      externalIncoming.has(n.name) || !localIncoming.has(n.name));
    const ordered = [], visited = new Set();
    function visit(name) {
      if (!members.has(name) || visited.has(name)) return;
      visited.add(name); ordered.push(members.get(name));
      for (const edge of (workflow.connections[name]?.main || []).flat()) visit(edge.node);
    }
    starts.forEach(n => visit(n.name));
    g.nodes.forEach(n => visit(n.name));
    g.nodes = ordered;
  }
  const notes = [];
  let y = 0;
  for (let offset = 0; offset < groups.length; offset += 3) {
    const row = groups.slice(offset, offset + 3);
    let maxHeight = 0;
    for (const [column, g] of row.entries()) {
      if (!g.nodes.length) throw new Error('Sticky sin nodos: ' + g.title);
      const index = offset + column;
      const x = column * 1500;
      const width = 1400;
      const height = 380 + Math.ceil(g.nodes.length / 4) * 200;
      maxHeight = Math.max(maxHeight, height);
      for (const [i, node] of g.nodes.entries()) node.position = [x + 70 + (i % 4) * 320, y + 320 + Math.floor(i / 4) * 200];
      const exits = new Set();
      for (const node of g.nodes) for (const edge of (workflow.connections[node.name]?.main || []).flat()) {
        const other = owner.get(edge.node); if (other && other !== g) exits.add(other.title);
      }
      const exitText = exits.size ? Array.from(exits).join(' · ') : 'Respuesta al navegador.';
      notes.push({ id: `sticky-organizada-${stage}-${index + 1}`, name: `${String(index + 1).padStart(2, '0')} · ${g.title}`,
        type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [x, y], parameters: {
          width, height, color: [5, 6, 4, 3, 2, 7, 5][index % 7],
          content: `## ${String(index + 1).padStart(2, '0')} · ${g.title}\n\n${g.purpose}\n\n**Regla:** ${g.rule}\n\n**Salidas:** ${exitText}\n\n**Mantenimiento:** ${g.nodes.length} nodos. PostgreSQL · CRM_N8N / wflow. Validar después de editar.`,
        } });
    }
    y += maxHeight + 140;
  }
  workflow.nodes = [...notes, ...nodes];
  return groups;
}
if (require.main === module) {
  for (let stage = 0; stage <= 3; stage++) {
    const file = stage === 0 ? 'Flujo 0 - Registro Inicial.json' : `Ningun Servicio Funciona - ${stage}.json`;
    const workflow = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    const groups = organize(workflow, stage);
    fs.writeFileSync(path.join(root, file), JSON.stringify(workflow, null, 2) + '\n');
    console.log(`${file}: ${groups.length} bloques documentados; ${groups.reduce((n, g) => n + g.nodes.length, 0)} nodos cubiertos.`);
  }
}
module.exports = { organize, definitions };
