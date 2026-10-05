// Código n8n: no lee los datos personales desde query ni genera otra sesión.
const body = $json?.body && typeof $json.body === 'object' && !Array.isArray($json.body) ? $json.body : {};
const stringValue = name => typeof body[name] === 'string' ? body[name].trim() : '';
const valores = Object.fromEntries(['usuario_asesor', 'numero_conexion', 'pqr'].map(name => [name, stringValue(name)]));
const session = stringValue('workflow_session');
const validSession = /^f0-[a-zA-Z0-9_-]{1,72}$/.test(session);
const validFields = Object.values(valores).every(value => value.length >= 1 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value));
return [{ json: {
  valido: validSession && validFields,
  workflow_session: validSession ? session : '',
  webhookUrl: String($json.webhookUrl || ''),
  valores,
  mensaje: validSession
    ? 'Completa los tres campos con un máximo de 100 caracteres por campo.'
    : 'No pudimos recuperar la referencia del formulario. Revisa los datos e intenta guardar nuevamente.',
} }];
