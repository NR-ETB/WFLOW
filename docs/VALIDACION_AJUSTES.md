# Validación de ajustes y trazabilidad — actualización del 26 de octubre de 2026

## Resultado y alcance

Los cuatro archivos del repositorio pasan quince suites locales. Las pruebas
de interfaz usan Edge sin ventana, a 360 y 1366 píxeles, con las solicitudes de
red simuladas o bloqueadas. Veintitrés recorridos utilizan campos HTML, código y
parámetros SQL reales de los JSON contra PostgreSQL en memoria (PGlite).

Esto no confirma la base productiva ni reproduce el motor de ejecución/Wait de
n8n. No se dispone de una conexión autenticada a CRM_N8N. No se han publicado
workflows, cambiado credenciales ni enviado formularios de prueba al servidor.

## Diferencias encontradas en la publicación

Observaciones históricas del 8 de octubre; no son una nueva comprobación de la
publicación del 26 de octubre. Los cambios actuales se validan localmente.

Consultas GET a `https://n8n.srv1479096.hstgr.cloud/webhook/`:

| Entrada | Resultado observado | Diferencia |
| --- | --- | --- |
| `etb-form-inicial` | HTTP 200, formulario POST | Todavía dice que el registro es independiente del diagnóstico. |
| `etb-form` sin sesión | HTTP 200, verificación de línea | Permite entrar sin el registro inicial; el repositorio exige inicio confirmado. |
| `etb-form-parte-2` sin sesión | HTTP 400, diagnóstico de acceso | Expone referencias técnicas de MySQL/CRM. La versión local usa mensajes operativos sin esos detalles. |
| `etb-form-parte-3` sin sesión | HTTP 400, contexto no válido | Rechazo esperable sin sesión. No permite determinar la versión publicada. |

Las respuestas son evidencia de una publicación incompatible con los archivos
actuales. No demuestran qué credencial o base usa n8n. El servidor puede tener
versiones anteriores o modificaciones distintas de este repositorio.

## Cobertura de los requisitos

Todos los resultados de esta sección corresponden a pruebas **locales**.

| Requisito del chat | Comprobación y resultado |
| --- | --- |
| Plantilla QR después de 24 horas | Seis campos específicos, visible y copiable; cierre y log probados. |
| Plantilla de sincronización ICCID | Seis campos específicos, sin sustituirla por la técnica; cierre y log probados. |
| Plantilla técnica de segundo nivel | Catorce campos, incluyendo BARRIO, CHARGING y SAAW; resumen y cierre probados. |
| Inventario de otras plantillas | GESTFAC conserva también la plantilla técnica de catorce campos. Su contenido operativo específico no fue proporcionado; requiere confirmación del responsable. |
| Cobertura obligatoria | Cuatro combinaciones viaje/cobertura. En navegador se bloquea envío antes del clic y se muestra aviso. |
| Abrir enlaces requeridos | Cobertura, consulta IMEI y guía de configuración verificadas en navegador. El clic no demuestra lectura ni carga correcta de una página externa. |
| Visual de QR | Formularios compactos, sin desbordamiento horizontal móvil/escritorio. Render y contenido comprobados; no se declara equivalencia pixel a pixel con capturas. |
| QR instalado o reutilizado antes de 24 horas | Validación posterior del servicio: funciona cierra; falla continúa soporte eSIM. |
| NIP vencido | Sin plantilla. Procedimiento Konecta/formulario o COS/Soul; único resultado «Se escaló el caso». |
| NIP recibido o pendiente | Escalamiento CRM BAM, sin plantilla ni apropiarse de ventas de otro aliado. Ambas salidas registradas. |
| SUMA: pospago con recursos | Continúa al diagnóstico del equipo y permite los cuatro resultados de etapa 3. |
| SUMA: prepago con recursos | Misma continuidad normal; cuatro resultados de etapa 3 probados. |
| SUMA: prepago sin recursos | Pantalla «No aplica falla… datos, minutos o SMS» y cierre `no_aplica_sin_recursos`, sin etapa 3. |
| Error de recuperación al pasar a etapa 3 | Contrato SQL canónico de sesión, resultado, siguiente paso y recursos comprobado. |
| Error 409 al cerrar y volver | Cierres de etapa 2 usan webhook estable; no reenvían al Wait consumido. Recuperación del botón y retorno local probados. |
| Guardado fallido | No se muestra éxito sin confirmación de la base; mensajes técnicos quedan fuera de la pantalla del asesor. Fallos HTTP, red, HTML inesperado y confirmaciones incorrectas probados. |
| Flujo 0 como inicio común | GET abre formulario sin referencias anteriores; genera sesión y POST registra los tres campos. Etapas siguientes exigen inicio confirmado. |
| Solo INSERT en flujo 0 | Cabecera y log inicial se insertan atómicamente. No autentica ni consulta usuarios existentes. Reintento de la misma sesión no actualiza datos, ejecución, versión o fechas. |
| Varias gestiones del mismo asesor | Admitidas, incluso con conexión y PQR iguales, usando referencias de sesión distintas. |
| Campos iniciales y ceros | Texto obligatorio de hasta cien caracteres; ceros iniciales preservados, contenido escapado en HTML y SQL parametrizado. |
| Datos iniciales permanentes | Inmutables en cabecera y copiados a columnas, respuestas y contexto de cada registro del log. |
| Log con integridad | FK, inicio confirmado obligatorio, clave sesión/flujo/etapa/intento, rollback si falla inicio y reintentos sin duplicar etapa. |
| Base exclusiva PostgreSQL | Diez nodos Postgres en los cuatro archivos; dos tablas, cuatro vistas, índices, funciones y triggers ejecutados localmente. No se certifica instalación remota. |
| Organización y stickies | Veinticuatro notas con contenido, reglas y salidas. Todos los nodos pertenecen a un bloque; no hay notas vacías ni superpuestas. |
| Pagos y documentación | Texto del botón según saldo; IMEI no registrado/bloqueado lleva a documentación y sus tres alternativas. |
| SIM y soporte | Solo SIM física/eSIM; SMS reutiliza soporte de llamadas. eSIM omite prueba cruzada y no pide retirar la SIM; espera veinte segundos. |
| Resumen y observaciones | Tres etapas y datos iniciales de la misma sesión; observaciones de diez a dos mil caracteres; cierre solo después de confirmar escritura. |

El log conserva el último estado de cada etapa/intento. No es un historial
inmutable de cada clic. Las actualizaciones de diagnóstico y observaciones
siguen siendo necesarias; el requisito de «solo inserts» se aplica al flujo 0.

## Reproducción y aceptación productiva

1. Ejecutar `node tools/validar_todo.js` para las quince suites locales.
2. Ejecutar `node tools/validar_interfaz.js` con Playwright disponible mediante
   `NODE_PATH` y Edge instalado. El navegador se ejecuta sin ventana y bloquea red.
3. Ejecutar `node tools/inspeccionar_publicacion.js` para diagnóstico GET. Código
   de salida 2 significa incompatibilidad; no es una prueba de escritura.
4. En CRM_N8N, instalar `database/postgres/00_Estructura.sql` si faltan objetos.
   Si ya existen con esa estructura, aplicar `02_InicioSoloInserts.sql`.
5. Con la cuenta de n8n, ejecutar `03_AuditoriaSoloLectura.sql`. Revisar objetos,
   permisos, triggers y los tres conteos de inconsistencias, que deben ser cero.
6. Importar y publicar los cuatro JSON compatibles; asignar la misma credencial
   PostgreSQL de CRM_N8N a los diez nodos. No mezclar versiones ni bases en una sesión.
7. Desde flujo 0, ejecutar gestiones de aceptación identificables y comprobar
   en CRM_N8N una cabecera y los logs de inicio/etapas correspondientes. Probar
   los cuatro estados SUMA, QR, NIP, sincronización y segundo nivel, incluido volver.
8. Comprobar cierre y observaciones en el log antes de declarar producción validada.

## Nueva atención en la misma pestaña

Las pantallas de cierre de las etapas 1 y 2 y el cierre definitivo de la etapa 3
incluyen «Iniciar nueva gestión». El enlace abre la entrada publicada del flujo 0
en la misma pestaña y dentro del panel del CRM. No transmite la sesión
anterior, respuestas ni datos iniciales. El flujo 0 genera una nueva referencia y
muestra los tres campos vacíos. La gestión anterior y su log se conservan.

Se eliminaron las instrucciones «Modo de prueba» y «Test workflow» de las pantallas.
El enlace de reinicio usa producción también desde una ejecución de prueba; requiere
que el flujo 0 esté publicado. Las transiciones entre etapas conservan su sesión y
no se sustituyen por el reinicio. No se muestra un cierre correcto cuando PostgreSQL
no confirma el guardado. Importar y publicar las tres etapas actualizadas para
que el cambio llegue a los asesores; editar el repositorio no cambia n8n remoto.

No reutilizar la contraseña expuesta en capturas. Rotarla y suministrar acceso
por un canal seguro, nunca mediante archivos versionados o mensajes del chat.

## Cierres GESTFAC y sincronización · 26 de octubre de 2026

Las dos pantallas envían «Finalizar» mediante navegación normal al Wait activo,
sin esperar un fetch desde el iframe. Después de guardar y confirmar la fila en
PostgreSQL, el workflow devuelve el cierre HTML y el botón para una nueva atención.
Las otras salidas conservan su respuesta `OK`, y Tipo SIM conserva el handoff.

Cuando se elige que no fue posible enviar o escalar, el log registra `Pendiente`
y la pantalla no afirma que el caso fue enviado. Las pruebas locales cubren ambas
respuestas en modo prueba/producción y rechazan confirmaciones de otra sesión.
No se ha verificado este cambio contra el motor Wait de n8n remoto.

Actualización posterior del 26 de octubre: se retiraron las opciones negativas
en GESTFAC y sincronización. Ambas pantallas solo muestran una confirmación de
envío/escalamiento realizado. La recepción de respuestas negativas antiguas se
mantiene compatible y no se presenta como envío exitoso.

## Premisas, reenvío y renovación QR · 26 de octubre de 2026

Después de «No, la falla continúa» se muestran las premisas entregadas por el
usuario: requisitos, pasos Android, pasos iPhone y recomendaciones. «SÍ FUNCIONA»
continúa al soporte normal; «NO FUNCIONA» abre el reenvío manual desde SUMA.
El asesor confirma mediante una casilla que reenvió el QR e informó al cliente.
El flujo no realiza el reenvío automáticamente ni afirma haberlo hecho.

En el reenvío, «SÍ FUNCIONA» continúa al soporte normal; «NO FUNCIONA» abre el
trámite de renovación con la misma visual y plantilla QR de seis campos.
La salida posterior al reenvío usa `gestor_qr_renovacion`; la salida histórica
por más de 24 horas conserva `gestor_qr_vencido`. Se registran `qr_premisas_ok`,
`qr_reenvio_confirmado` y `qr_reenvio_ok` en los JSON de respuestas/contexto del
log, sin cambiar la estructura de las tablas. El resumen de etapa 3 muestra
esas validaciones cuando la gestión continúa al soporte.

SUMA añade «Activo sin recursos o recursos incompletos (pospago)». Usa el mismo
cierre «No aplica falla» que prepago, conserva su valor `PospagoSinRecursos` en
el log y no permite entrar a la etapa 3 sin recursos disponibles.

Las notas del canvas incluyen las reglas de la nueva secuencia. Ejecutar
`node tools/validar_interfaz_qr.js` con Playwright disponible para las pruebas
de las nuevas pantallas. Importar/publicar etapas 2 y 3 compatibles; no se ha
modificado la publicación remota ni ejecutado acciones reales en SUMA.

## Saldo pendiente y enlace IMEI · 26 de octubre de 2026

«No, tiene saldo pendiente» ya no finaliza directamente ni muestra «Confirmar y
reconectar». Abre un paso con el texto de pago obligatorio entregado por el usuario.
Después de confirmar que el cliente fue informado, la gestión se registra con
resultado `pago_pendiente`, estado `Pendiente` y `pago_pendiente_informado=Si` en
respuestas/contexto del log. No continúa al diagnóstico ni asegura una reconexión.
Volver permite regresar a la validación de pagos.

La consulta de IMEI apunta exactamente a `https://www.imeicolombia.com.co/` y
mantiene la obligación de abrir el enlace antes de continuar. Se actualizó la
prueba de regresión para rechazar la URL anterior. La comprobación web del sitio
devolvió timeout; no se certifica su disponibilidad externa.

`aplicar_cierres_etapa1.js` conserva las confirmaciones únicas y
`aplicar_pago_imei.js` conserva el nuevo paso y enlace al regenerar mediante
`preparar_postgres.js`. Publicar la etapa 1 actualizada para llevarlo a n8n.

## Reinicio dentro del CRM y descripción GESTFAC · 27 de octubre de 2026

Los enlaces «Iniciar nueva gestión» usan `target="_self"` en las tres etapas,
incluidos el cierre HTML de etapa 1 y el cierre definitivo con observaciones.
El destino sigue siendo la URL absoluta publicada de flujo 0, sin parámetros.
Antes usaban `_top`, que intentaba navegar la ventana principal del CRM y podía
quedar bloqueado por las restricciones del iframe contenedor.

`node tools/validar_reinicio_iframe.js`, con Playwright disponible y Edge,
reproduce el CRM y n8n en orígenes distintos, con dos iframes y sandbox. El
botón anterior falla en esa prueba. La corrección comprueba siete tipos de
cierre a 360 y 1366 px: un clic crea una gestión nueva, los tres campos quedan
vacíos y se conservan el CRM y la pestaña. Todas las respuestas son simuladas;
no se conecta a n8n remoto ni a la base productiva.

La descripción de «Enviar el caso por GESTFAC» queda así:

> Si la línea se encuentra suspendida o cortada por falta de pago, pero el cliente confirma que ya realizó el pago correspondiente, se debe escalar el caso a través de GESTFAC para validar y gestionar la reconexión del servicio.

Los scripts de adaptación conservan ambos cambios al ejecutar
`preparar_postgres.js`. Para aplicarlos al sitio, importar y publicar las etapas
1, 2 y 3 actualizadas; después iniciar una gestión nueva desde flujo 0 y comprobar
el reinicio dentro del CRM real. Las ejecuciones Wait ya iniciadas pueden
conservar la versión anterior. La publicación remota sigue pendiente.
