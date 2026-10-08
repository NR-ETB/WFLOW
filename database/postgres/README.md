# Instalación de las gestiones en CRM_N8N

La captura muestra puerto interno 5432. Esta entrega asume PostgreSQL 14 o
superior; confirma el motor y la versión en el servicio antes de instalar.
El puerto externo 3316 es un mapeo del servidor hacia 5432, no un puerto MySQL.
La base operativa de WFLOW no reemplaza la base interna de n8n ni su configuración.

## Conexión

En n8n crea una credencial **Postgres** para los diez nodos de persistencia de
los cuatro JSON. No reutilices una credencial MySQL.

- Host interno mostrado: `crm-crmdbn8n-fkjhdz` (confirma el nombre en tu panel).
- Puerto interno: `5432`.
- Database: `CRM_N8N`, respetando mayúsculas.
- Usuario del servicio: `crm_user_n8n`.
- Contraseña: introducir solamente en la credencial de n8n, después de rotarla.

El host interno funciona únicamente si n8n comparte la red Docker del servicio.
Un puerto abierto no demuestra que ambos contenedores compartan red. Si n8n
está en otro servidor, usa una red privada/VPN o un túnel autorizado. No abras
3316 a cualquier IP; limita el acceso a los clientes autorizados. La política
SSL debe corresponder a la conexión real; no desactives la validación TLS para
resolver un problema de red.

## Orden del cambio

1. Respaldar ambas bases y probar una restauración. Finalizar gestiones en curso
   o mantenerlas en la versión anterior; una sesión no debe repartirse entre bases.
2. Conectar explícitamente a `CRM_N8N`, consultar `SELECT current_database(), version();`
   y ejecutar `00_Estructura.sql` completo con una cuenta instaladora.
3. Verificar el esquema `wflow`, dos tablas, cuatro vistas y las funciones/triggers.
4. Importar los cuatro JSON y asignar la misma credencial Postgres a todos sus
   nodos de lectura y escritura. Los archivos no contienen secretos ni IDs de credenciales.
5. Publicar las cuatro versiones compatibles. Iniciar una gestión nueva en
   `/webhook/etb-form-inicial`, sin parámetros ni referencias anteriores.
6. Probar registro, continuidad, ambas opciones SUMA con recursos, cierre sin
   recursos, QR, NIP, escalamiento, observaciones y errores de conexión.
7. Ejecutar `01_Verificacion.sql`; los conteos de inconsistencias deben ser cero.

La cuenta instaladora es propietaria. Si usas otro usuario para n8n, concede
USAGE sobre `wflow`, SELECT/INSERT/UPDATE sobre las dos tablas, USAGE/SELECT
sobre sus secuencias y EXECUTE sobre
`wflow.registrar_inicio_gestion(text,jsonb,text,text)`. No necesita permisos
DDL ni DELETE. La función usa permisos del llamador, no SECURITY DEFINER.

La instalación no elimina datos y se puede repetir sobre esta misma estructura.
`CREATE TABLE IF NOT EXISTS` no migra una tabla incompatible creada manualmente:
si existen objetos con otra definición, inspecciónalos antes de ejecutar.

## Datos y garantías

- `wflow.gestiones`: referencia única y usuario/conexión/PQR originales, inmutables.
- `wflow.gestiones_log`: fila por sesión, flujo, etapa e intento, con FK a la cabecera.
- Los tres datos iniciales se copian a columnas, respuestas y contexto de cada etapa.
- JSONB conserva respuestas, contexto, errores y observaciones. Identificadores
  son texto para conservar ceros iniciales. Fechas usan `timestamptz(3)`; presentar
  en `America/Bogota` sin alterar el instante almacenado.
- Registrar el inicio es una sola sentencia atómica. Un reintento conserva el
  original; no duplica filas ni actualiza ejecución, versión o fechas anteriores.
  La función inicial solo utiliza INSERT para escribir. No autentica al asesor ni
  consulta un catálogo de usuarios existentes. Se puede registrar varias gestiones
  con el mismo asesor, conexión y PQR, siempre que sean sesiones distintas.
  Mantiene únicamente validaciones de campos obligatorios, tamaño y formato seguro.
  Cada cierre comprueba el resultado devuelto por la base.
- Una etapa no puede guardarse sin cabecera y log inicial confirmado.
- El log mantiene el último estado de cada etapa/intento; no es un historial
  inmutable de cada clic o modificación. Las ejecuciones de n8n son independientes.

Vistas: `vw_gestiones_trazabilidad`, `vw_gestiones_resumen`,
`vw_nsf_trazabilidad` y `vw_nsf_resumen`, todas en `wflow`.

## Historial MySQL

Esta instalación empieza con tablas nuevas. No copia automáticamente el CRM.
Los scripts `*_Workbench.sql` del directorio superior se conservan como archivo
histórico y no son compatibles con PostgreSQL. No ejecutar dumps MySQL en PostgreSQL.

Si se requiere trasladar historial, acordar primero alcance y corte: exportar
cabeceras y logs, mapear CamelCase a snake_case, validar JSON y fechas, importar
en tablas de staging y conciliar conteos por sesión/etapa. Solo trasladar al
esquema operativo las sesiones con inicio real verificable. El historial sin
usuario, conexión o PQR debe conservarse en un archivo/esquema histórico separado;
no inventar datos para satisfacer las restricciones. No se ha ejecutado este
traslado ni cambiado la base de producción.

## Pruebas locales

Las pruebas PostgreSQL usan PGlite, un motor PostgreSQL en WASM, en memoria. No
acceden a producción. Instalar dependencia de prueba fuera de los JSON:

```powershell
npm install --prefix preview/test-postgres --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.3.14
node tools/preparar_postgres.js
```

Se ejecuta DDL dos veces y se comprueban rollback, reintento, ceros iniciales,
snapshots, consultas de continuidad, SUMA, resumen, observaciones y confirmaciones.
Esto no sustituye la prueba de red, permisos y ejecución en tu versión de n8n.

Si las tablas ya están instaladas, ejecuta `02_InicioSoloInserts.sql` en CRM_N8N
para actualizar únicamente la función del inicio. Si no existen, instala primero
`00_Estructura.sql`. No es necesario borrar registros ni recrear la base.

`node tools/validar_todo.js` ejecuta once suites, incluyendo veinte recorridos que
usan formularios, parámetros SQL y confirmaciones extraídos de los cuatro JSON.
`node tools/inspeccionar_publicacion.js` revisa las entradas públicas con GET; sale
con código 2 si detecta una publicación incompatible. No envía formularios ni
comprueba que las escrituras lleguen a CRM_N8N.

Para auditar la base real sin mostrar datos personales, ejecuta
`03_AuditoriaSoloLectura.sql` con la misma cuenta que usa n8n. Verifica base,
objetos, permisos, triggers, función inicial sin UPDATE/DELETE e integridad del
log. Si falta un objeto, detén la comprobación e instala la estructura antes de
probar formularios. Los tres conteos de inconsistencias deben ser cero.

Referencias técnicas: [nodo Postgres de n8n](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/),
[triggers PostgreSQL](https://www.postgresql.org/docs/current/plpgsql-trigger.html).
