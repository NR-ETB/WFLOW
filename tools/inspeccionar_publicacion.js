// Consulta únicamente GET: no inicia registros en la base ni envía datos personales.
const base = process.env.WFLOW_PUBLIC_BASE || 'https://n8n.srv1479096.hstgr.cloud';
async function main() {
  let incompatible = false;
  for (const route of ['etb-form-inicial', 'etb-form', 'etb-form-parte-2', 'etb-form-parte-3']) {
    try {
      const response = await fetch(base + '/webhook/' + route, { signal: AbortSignal.timeout(12000) });
      const html = await response.text();
      const facts = { route, status: response.status, destino: response.url,
        titulo: html.match(/<title>([^<]*)<\/title>/i)?.[1] || null,
        formulario_inicial: html.includes('Usuario del asesor'),
        entrada_comun: html.includes('Este registro inicia la gestión'),
        registro_independiente_antiguo: html.includes('Este registro inicial es independiente'),
        formulario_post: /<form[^>]+method="POST"/i.test(html),
        json_error: /^\s*\{\s*"(?:code|message)"/.test(html),
        detalles_tecnicos_en_pantalla: /MySQL presentó|CRM\.GestionesFlujosLog|webhook is not registered/.test(html),
      };
      facts.compatible_con_entrada_actual = route === 'etb-form-inicial'
        ? response.ok && facts.entrada_comun && !facts.registro_independiente_antiguo
        : route === 'etb-form' ? response.ok && facts.formulario_inicial
          : response.status === 400 && !facts.detalles_tecnicos_en_pantalla && !facts.json_error;
      incompatible ||= !facts.compatible_con_entrada_actual;
      console.log(JSON.stringify(facts));
    } catch (error) { console.error(JSON.stringify({ route, error: error.message })); process.exitCode = 1; }
  }
  if (incompatible && !process.exitCode) process.exitCode = 2;
  console.log('Solo GET. No comprueba credenciales, tablas, escrituras ni ejecuciones Wait de n8n.');
}
main();
