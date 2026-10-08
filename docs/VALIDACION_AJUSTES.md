# Validación de ajustes y trazabilidad — 8 de octubre de 2026

## Resultado y alcance

Los cuatro archivos del repositorio pasan once suites locales. Además, se han
probado setenta renders en Edge sin ventana, a 360 y 1366 píxeles, con toda
solicitud de red bloqueada. Veinte recorridos utilizan campos HTML, código y
parámetros SQL reales de los JSON contra PostgreSQL en memoria (PGlite).

Esto no confirma la base productiva ni reproduce el motor de ejecución/Wait de
n8n. No se dispone de una conexión autenticada a CRM_N8N. No se han publicado
workflows, cambiado credenciales ni enviado formularios de prueba al servidor.

## Diferencias encontradas en la publicación

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

1. Ejecutar `node tools/validar_todo.js` para las once suites locales.
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
   los tres estados SUMA, QR, NIP, sincronización y segundo nivel, incluido volver.
8. Comprobar cierre y observaciones en el log antes de declarar producción validada.

No reutilizar la contraseña expuesta en capturas. Rotarla y suministrar acceso
por un canal seguro, nunca mediante archivos versionados o mensajes del chat.
