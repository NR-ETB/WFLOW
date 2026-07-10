# Ningún Servicio Funciona — v11 primera parte

Esta versión corrige la primera parte del flujo según el diagrama y reemplaza el archivo CSV local por persistencia MySQL.

## Archivos

- `database/00_workbench_setup_completo.sql`: instalación completa para MySQL Workbench dentro del esquema validado `CRM`; crea la tabla, la vista y ejecuta verificaciones.
- `Ningun Servicio Funciona - v11.7 Auditada CRM Responsive SQL.json`: workflow recomendado, auditado de extremo a extremo y alineado con la base real.
- `database/01_create_table_nsf.sql`: tabla de escritura e índices.
- `database/02_create_view_nsf.sql`: vista opcional para reportes.
- `tools/generar_v11.js`: fuente de mantenimiento que regenera la v11 desde la v10.

## Configuración de la base

1. Selecciona la base `CRM`, que fue verificada con la cuenta `crm_user`.
2. Ejecuta `database/01_create_table_nsf.sql` dentro de esa base si la tabla no existe.
3. Ejecuta `database/02_create_view_nsf.sql` únicamente si el usuario tiene permiso `CREATE VIEW` y se requiere reportería.
4. En n8n crea una credencial MySQL llamada `CRM` con el host, puerto y usuario suministrados. Introduce la contraseña directamente en el almacén de credenciales de n8n; no debe copiarse al workflow ni a este repositorio.
5. En la credencial indica exactamente `CRM` como base. Configura SSL o túnel SSH si lo exige la infraestructura.

## Importación y prueba

1. Importa el JSON v11.7.
2. Abre `Guardar Respuestas MySQL` y selecciona la credencial `CRM`.
3. Ejecuta una prueba por cada salida: pago pendiente, GESTFAC, gestor, registro IMEI, documentación y tipo de SIM.
4. Confirma que cada `workflow_session` genera una sola fila y que un reintento actualiza la misma fila.
5. Mantén inactivas las versiones anteriores que usan el webhook `etb-form` y activa únicamente la versión aprobada.

## Contrato de salida

`resultado_etapa_1` puede tomar estos valores:

- `pago_pendiente`
- `gestfac`
- `gestor_sincronizacion`
- `registro_imei_gestionado`
- `documentacion_bloqueo`
- `continuar_parte_2`

Cuando el resultado es `continuar_parte_2`, `next_step` queda en `parte_2_tipo_sim`. Ese es el punto de integración previsto para el siguiente workflow.

## Mantenimiento

Los formularios exportados contienen HTML repetido porque n8n guarda el código dentro de cada nodo. Las configuraciones y transformaciones de esta versión están centralizadas en `tools/generar_v11.js`. Para regenerar el JSON después de un cambio:

```powershell
node .\tools\generar_v11.js
```

La contraseña de la base nunca debe añadirse al generador, al JSON o a los scripts SQL.

## Organización visual v11.2

La distribución sigue el diagrama funcional de izquierda a derecha:

1. Inicio y estado de línea.
2. Pagos arriba; GESTFAC abajo.
3. ICCID en el centro.
4. IMEI/SRTM arriba; inconsistencia de ICCID abajo.
5. Registro IMEI, bloqueo, documentación o tipo de SIM.
6. Persistencia MySQL al extremo derecho.

Las imágenes incrustadas de versiones anteriores se sustituyeron por once bloques compactos para evitar superposición y reducir el tamaño del workflow.

## Cierre y webhook v11.3

- En una ejecución `test`, el flujo muestra una pantalla de confirmación final. Para repetir la prueba hay que volver a n8n y pulsar `Test workflow` nuevamente.
- En una ejecución `production`, el flujo regresa automáticamente a `/webhook/etb-form` después de completar el cierre y guardar en MySQL.
- El webhook de producción requiere que el workflow esté activo.

## Credencial y botones v11.4

- Los botones Volver y Continuar tienen una altura uniforme de 56 px en escritorio y 54 px en móvil.
- El JSON no contiene la contraseña de MySQL. Después de importar hay que crear o seleccionar la credencial `CRM` en `Guardar Respuestas MySQL`.
- Datos validados de la credencial: host `72.60.248.165`, puerto `3306`, base `CRM` y usuario `crm_user`. La contraseña debe introducirse directamente en n8n.

## Responsive y acceso MySQL v11.5

- Interfaz adaptada a móviles desde 320 px, tabletas, escritorio, pantallas grandes y orientación horizontal de poca altura.
- Incluye safe areas, unidades `svh/dvh`, tipografía fluida, radios en grid, botones táctiles y reducción de movimiento.
- El error `Access denied for user 'user_crm'` indica que la credencial usa un nombre diferente al observado en Workbench (`crm_user`).
- MySQL autentica la combinación usuario y host. La IP de salida mostrada por el error es `187.124.150.43`; el DBA debe comprobar que la cuenta correcta puede conectarse desde esa dirección.
- Consulta `database/03_diagnostico_acceso_n8n.sql` para las verificaciones y permisos mínimos.

## Escala Full HD y móvil vertical v11.6

- En resoluciones desde 1200 px, la tarjeta crece hasta 1040 px; en pantallas de 1800 px o más puede llegar a 1100 px.
- En Full HD aumentan proporcionalmente títulos, textos, opciones y botones.
- Por debajo de 900 px, opciones y botones se organizan en una sola columna vertical.
- En orientación horizontal de poca altura se usa un modo compacto independiente para evitar scroll innecesario.

## Auditoría funcional v11.7

- La cuenta `crm_user` autentica correctamente y tiene privilegios sobre `CRM.*`; `crm_n8n` no es un esquema autorizado para esa cuenta.
- La tabla `CRM.n8n_nsf_respuestas` y la vista `CRM.vw_n8n_nsf_respuestas` existen y coinciden con el contrato del workflow.
- Ejecuta `node .\tools\auditar_v11_7.js` para validar nodos, rutas, formularios, persistencia y scripts SQL sin modificar datos remotos.
