# Ningún servicio funciona · flujo guiado completo

Este repositorio contiene un diagnóstico de tres workflows independientes de
n8n que se presentan al usuario como un solo recorrido, además de un flujo 0
independiente para el registro inicial. Las tres partes del diagnóstico comparten
`workflowSession` y registran su trazabilidad en una única tabla general de MySQL.

## Arquitectura

### Flujo 0 independiente

`Flujo 0 - Registro Inicial.json` es un registro inicial nuevo, separado del
diagnóstico existente. Por ahora solicita únicamente:

- Usuario del asesor (no su contraseña).
- Número de conexión.
- PQR (número o referencia).

Los tres campos son obligatorios, con un máximo de 100 caracteres. Los
identificadores se conservan como texto para no perder ceros iniciales. Se envían
por POST y no se incluyen en la URL. La validación se realiza tanto en la pantalla
como en el servidor.

El registro usa dos tablas: `CRM.GestionesFlujos` conserva el registro original
por sesión y `CRM.GestionesFlujosLog` conserva su trazabilidad. En ambas están
`usuarioAsesor`, `numeroConexion` y `pqr`, como texto de hasta 100 caracteres.
El log también conserva los tres valores en `respuestasJson` y `contextoJson`,
con `codigoFlujo = inicioGestion`, `codigoEtapa = registroInicial` y `numeroEtapa = 0`.
Cada apertura genera su propia sesión y los reintentos conservan esa referencia.
El usuario escrito es un dato operativo, no una autenticación.

Antes de importar esta versión, respalda la base y ejecuta
`database/02_DatosInicialesGestion_Workbench.sql` en MySQL 8.4+, después de la
migración 00. No vuelvas a ejecutar la migración 00 sobre una base ya convertida.
La migración 02 conserva el historial, recupera registros iniciales existentes
en JSON y crea las columnas, vistas, triggers y `CRM.RegistrarInicioGestion`.
Los cambios DDL no se revierten con un rollback; realiza la instalación completa
en una ventana de mantenimiento y detente si una prevalidación falla.

El procedimiento guarda el registro principal y su log en una sola transacción.
Si alguna escritura falla, ambas se revierten. Debe llamarse sin una transacción
externa. Un reintento conserva los datos originales de la sesión, no los reemplaza.
La pantalla muestra los valores confirmados por la base, no asume que se guardaron.
Si el guardado falla, vuelve al formulario con los datos conservados.
Los triggers rechazan nuevos registros del flujo 0 que pretendan escribir solo
en el log sin registro principal. Por eso es obligatorio publicar el JSON nuevo
después de aplicar la migración; no dejes operativa la versión anterior del flujo 0.

Los triggers copian los datos iniciales a cualquier etapa que use el mismo
`workflowSession`. Los registros históricos sin flujo 0 mantienen esas columnas
en NULL: no se inventa información. Los flujos 1–3 siguen independientes; cuando
se conecten al flujo 0 deberán conservar su sesión para recibir estos datos.
Las vistas generales son `CRM.VwGestionesFlujosTrazabilidad` y
`CRM.VwGestionesFlujosResumen`. Las vistas NSF existentes no se reemplazan.
Después de instalar y probar el registro, ejecuta las consultas de control de
`database/03_DatosInicialesGestion_Consultas.sql`. Permiten detectar registros
sin log inicial y diferencias entre los datos originales y sus copias, sin
modificar la base.

Importa el JSON, asigna la credencial CRM a `Guardar Registro Inicial MySQL` y
asegura permisos EXECUTE sobre `RegistrarInicioGestion`, además de SELECT,
INSERT y UPDATE sobre las dos tablas. La instalación de la migración requiere
permisos para crear/alterar tablas, rutinas, triggers y vistas. Publica el workflow.
Entrada productiva: `/webhook/etb-form-inicial`. El formulario
envía a `/webhook/etb-form-inicial-guardar`. Usa las rutas productivas para probar
el recorrido completo con ambos webhooks publicados. Restringe el acceso al
personal autorizado mediante la configuración de la instancia. Este flujo no
redirige a las partes 1–3 ni modifica sus registros.

Generación y validación local:

```powershell
node tools/generar_flujo0.js
node tools/validar_flujo0.js
node tools/validar_datos_iniciales_db.js
```

### Diagnóstico existente

```text
Ningún servicio funciona - 1 ─┐
Ningún servicio funciona - 2 ─┼─> CRM.GestionesFlujosLog
Ningún servicio funciona - 3 ─┘
                                      ├─> CRM.VwNsfTrazabilidad
                                      └─> CRM.VwNsfResumen
```

Cada etapa genera una fila en el log. Una gestión completa tiene tres filas con
el mismo `workflowSession` y diferente `codigoEtapa`.

| Parte | `codigoEtapa` | `numeroEtapa` |
|---|---|---:|
| Estado, pagos, ICCID e IMEI | `validacionServicio` | 1 |
| SIM, QR, portación y SUMA | `diagnosticoSim` | 2 |
| Configuración y prueba de equipo | `configuracionEquipo` | 3 |

## Reglas operativas vigentes

- La etapa 1 obliga a validar la cobertura móvil en el mapa oficial de ETB y
  registrar las cuatro combinaciones entre viaje y disponibilidad de cobertura.
  El botón `Continuar` permanece deshabilitado hasta abrir el enlace y la vista
  muestra un aviso visible con este requisito.
- En pagos, el botón muestra `Siguiente` cuando la cuenta está al día y
  `Confirmar y reconectar` cuando existe saldo pendiente.
- La consulta pública del IMEI debe abrirse antes de habilitar la continuación;
  un IMEI bloqueado o no registrado se transfiere directamente a documentos.
- La transferencia documental registra si fue una llamada dentro del horario,
  una llamada fuera del horario gestionada digitalmente o una atención que ya
  ingresó directamente por canal digital.
- Solo se manejan SIM física y eSIM; `MultiSIM` fue retirado del recorrido.
- Para eSIM, una única pantalla confirma si el QR quedó instalado. Si falla con
  menos de 24 horas se reutiliza; al cumplirlas se registra obligatoriamente el
  escalamiento al gestor. Esta pantalla usa una disposición compacta vertical
  para mantener la misma jerarquía visual del escalamiento.
- SUMA continúa a la etapa 3 cuando existen recursos pospago o prepago. Cuando
  faltan recursos prepago, usa un cierre estable sin `webhook-waiting`, permite
  volver localmente y registra `no_aplica_sin_recursos`.
- En la etapa 3, `Falla en SMS` usa la misma ruta de soporte que
  `Falla en llamadas`.
- Las eSIM omiten cualquier prueba cruzada en otro dispositivo. Su reinicio usa
  modo avión, apagado durante 20 segundos y nuevo encendido, sin retirar la SIM.

## Archivos principales

- `Flujo 0 - Registro Inicial.json`
- `Ningun Servicio Funciona - 1.json`
- `Ningun Servicio Funciona - 2.json`
- `Ningun Servicio Funciona - 3.json`
- `database/00_GestionesFlujosLog_Workbench.sql`
- `database/01_GestionesFlujosLog_Consultas.sql`
- `database/02_DatosInicialesGestion_Workbench.sql`
- `database/03_DatosInicialesGestion_Consultas.sql`
- `tools/adaptar_log_general.js`

## Instalación en la base

1. Confirma que existe `CRM.n8n_nsf_respuestas` y que todavía no existe
   `CRM.GestionesFlujosLog`.
2. Ejecuta una sola vez `database/00_GestionesFlujosLog_Workbench.sql`.
3. Comprueba que aparezcan:
   - `CRM.GestionesFlujosLog`
   - `CRM.VwNsfTrazabilidad`
   - `CRM.VwNsfResumen`

El script conserva los registros existentes. La tabla original es renombrada,
sus campos comunes pasan a CamelCase y las filas antiguas quedan identificadas
como `validacionServicio`.

La unicidad anterior por `workflowSession` se reemplaza por:

```text
workflowSession + codigoFlujo + codigoEtapa + numeroIntento
```

Esto permite tres etapas por sesión y hace idempotente cada intento.

## Instalación en n8n

1. Importa los tres JSON.
2. Asigna la misma credencial MySQL CRM a:
   - `Guardar Respuestas MySQL`
   - `Consultar Contexto Etapa 1 MySQL`
   - `Guardar Etapa 2 MySQL`
   - `Consultar Contexto Etapa 2 MySQL`
   - `Guardar Etapa 3 MySQL`
   - `Consultar Resumen Gestion Actual`
   - `Guardar Observaciones Asesor MySQL`
3. Publica los tres workflows.
4. Inicia la prueba desde el webhook de la primera parte:

```text
/webhook/etb-form
```

Los handoffs productivos son:

```text
/webhook/etb-form-parte-2
/webhook/etb-form-parte-3
```

## Continuidad entre partes

La parte 2 solo continúa si encuentra en el log:

```text
codigoFlujo = ningunServicioFunciona
codigoEtapa = validacionServicio
resultado = continuar_parte_2
nextStep = parte_2_tipo_sim
tipo_sim informado en respuestasJson
```

La parte 3 solo continúa si encuentra:

```text
codigoFlujo = ningunServicioFunciona
codigoEtapa = diagnosticoSim
resultado = continuar_parte_3
nextStep = parte_3_configuracion_equipo
suma_ok = PospagoConRecursos o PrepagoConRecursos en respuestasJson
```

## Cierre de la gestión

Los cuatro resultados técnicos de la parte 3 convergen en un cierre único:

1. La etapa 3 se registra con `estadoGestion = PendienteCierre` y
   `nextStep = cierre_asesor`.
2. Se consulta `GestionesFlujosLog` usando exclusivamente el
   `workflowSession` de esa ejecución.
3. El asesor ve un resumen visual de las tres etapas y escribe observaciones
   obligatorias de entre 10 y 2000 caracteres.
4. Las observaciones se agregan a `respuestasJson` y `contextoJson` de la misma
   fila `configuracionEquipo`.
5. La gestión queda en `Completada` o `Escalada`, con `nextStep = fin_flujo`.

No se crea otra tabla. En `VwNsfResumen`, la columna
`respuestasEtapa3Json` conserva `observaciones_asesor` y
`fecha_cierre_asesor` para la sesión correspondiente.

## Validación posterior al QR

Cuando la eSIM queda instalada o el QR se reutiliza antes de cumplir 24 horas,
la etapa 2 solicita confirmar la funcionalidad del servicio:

- Si el servicio funciona, la gestión se guarda y cierra en la etapa 2 con
  `resultado = servicio_normalizado_qr`.
- Si la falla continúa, el flujo sigue con las validaciones de soporte eSIM
  (línea portada, NIP y recursos en SUMA).
- Si el QR ya cumplió 24 horas sin funcionar, se presenta directamente el
  escalamiento al gestor.

La etapa 2 acepta `__workflow_session`, tal como lo envían los formularios,
y conserva esa sesión al guardar. Los cierres QR, NIP y CRM BAM usan el webhook
estable `etb-form-parte-2-continuar`; un reintento no reutiliza un Wait terminado.
La interfaz confirma el cierre solo después de recibir `OK` del guardado.
Si el guardado falla, conserva las respuestas y permite reintentar. El detalle
técnico queda en `persistence_diagnostic` de la ejecución, no en la pantalla del
asesor. No se oculta un fallo ni se presenta una gestión no guardada como exitosa.

Después de actualizar esta versión, importa y publica nuevamente la parte 2.
Prueba con una gestión nueva; las ejecuciones Wait anteriores pueden conservar
el código de la versión con la que comenzaron. Las pruebas locales no sustituyen
la comprobación del guardado en la instancia productiva de n8n.

## Plantilla de escalamiento

Las salidas incluyen una plantilla desplegable y un botón para copiarla. El
contenido depende del proceso:

- QR vencido: fecha de expedición de la cédula, línea, descripción del error,
  observación con la solución requerida o resultado esperado, contacto y
  sistema operativo.
- Sincronización ICCID: fecha de expedición de la cédula, correo del
  cliente, cuenta de facturación, error, solución requerida y contacto.
- Vencimiento de NIP: no muestra plantilla. La venta se gestiona nuevamente
  según el procedimiento interno del aliado: formulario en Konecta, Soul en
  COS o la plataforma definida por el aliado.
- NIP recibido o pendiente dentro del plazo: no muestra plantilla. El caso se
  escala a CRM BAM porque la venta corresponde a otro aliado.
- Prepago sin recursos o con recursos incompletos: no muestra plantilla. La
  gestión cierra como `no_aplica_sin_recursos` y registra que no existe falla
  cuando el servicio requiere datos, minutos o SMS no disponibles.
- Escalamiento técnico a segundo nivel: USUARIO, CANAL, TIPO DE FALLA, IMEI,
  MODELO / MARCA / EQUIPO, BLOQUEO, NOMBRE, CC / CÉDULA, LÍNEA, CONTACTO,
  CIUDAD, BARRIO, CHARGING y SAAW.

La plantilla se copia para diligenciarla en el canal operativo definido. Sus
datos personales no se envían en la URL ni se guardan automáticamente en el
log del flujo.

## Consultas operativas

Trazabilidad completa, una fila por etapa:

```sql
SELECT *
FROM CRM.VwNsfTrazabilidad
ORDER BY workflowSession, numeroEtapa, numeroIntento, createdAt;
```

Resumen, una fila por gestión:

```sql
SELECT *
FROM CRM.VwNsfResumen
ORDER BY ultimaActualizacion DESC;
```

Una sesión puntual:

```sql
SELECT *
FROM CRM.VwNsfTrazabilidad
WHERE workflowSession = 'PEGA_AQUI_LA_SESION'
ORDER BY numeroEtapa, numeroIntento, createdAt;
```

## Flujos futuros

Los siguientes flujos también escribirán en `GestionesFlujosLog` usando un
`codigoFlujo` diferente. No necesitan tablas nuevas. Cada proceso puede exponer
sus propias vistas de trazabilidad y resumen filtradas por `codigoFlujo`.

## Validación local

```powershell
node tools/validar_v11.js
node tools/validar_etapa2.js
node tools/validar_etapa3.js
node tools/validar_integracion.js
node tools/validar_plantillas_escalamiento.js
node tools/validar_cierre_etapa2.js
```

Si se regeneran los workflows con herramientas antiguas, vuelve a aplicar el
contrato del log general y después los ajustes operativos actuales:

```powershell
node tools/adaptar_log_general.js
node tools/aplicar_ajustes_operativos_202608.js
```
