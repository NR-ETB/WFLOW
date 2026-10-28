// Contrato único para la plantilla operativa, el editor y la evidencia del log.
const fields = [
  ['usuario', 'USUARIO', ['usuario_asesor']],
  ['canal', 'CANAL', ['canal_atencion']],
  ['tipo_falla', 'TIPO DE FALLA', ['tipo_falla_equipo']],
  ['imei', 'IMEI', ['imei_cliente', 'imei']],
  ['equipo', 'MODELO / MARCA / EQUIPO', ['marca_modelo_equipo']],
  ['bloqueo', 'BLOQUEO', ['bloqueado']],
  ['nombre', 'NOMBRE', ['nombre_cliente']],
  ['documento', 'CC / CÉDULA', ['cedula_cliente', 'documento_cliente']],
  ['linea', 'LÍNEA', ['numero_linea', 'linea_cliente']],
  ['contacto', 'CONTACTO', ['numero_contacto', 'contacto_cliente']],
  ['ciudad', 'CIUDAD', ['ciudad_cliente']],
  ['barrio', 'BARRIO', ['barrio_cliente']],
  ['charging', 'CHARGING', ['charging']],
  ['saaw', 'SAAW', ['saaw']],
];
function templateValues(source, definitions) {
  const text = value => typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300) : '';
  const labels = { DatosRed: 'Falla de datos o red', Llamadas: 'Falla en llamadas', SMS: 'Falla en SMS', Ambas: 'Datos/red y llamadas' };
  return Object.fromEntries(definitions.map(([key, , aliases]) => {
    const explicit = Object.prototype.hasOwnProperty.call(source, 'segundo_nivel_' + key);
    let value = text(source['segundo_nivel_' + key]);
    if (!explicit) for (const alias of aliases) { value = text(source[alias]); if (value) break; }
    if (key === 'tipo_falla') value = labels[value] || value;
    if (key === 'bloqueo') value = value === 'Si' ? 'Sí, bloqueado' : value === 'No' ? 'No está bloqueado' : value;
    return [key, value];
  }));
}
function templateText(values, definitions) {
  return definitions.map(([key, label]) => label + ': ' + (values[key] || '')).join('\n');
}
const runtime = `const secondLevelFields = ${JSON.stringify(fields)};\n${templateValues.toString()}\n${templateText.toString()}\n`;
module.exports = { fields, templateValues, templateText, runtime };
