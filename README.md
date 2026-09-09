# Ningún servicio funciona · flujo guiado completo

Este repositorio contiene tres workflows independientes de n8n que se presentan
al usuario como un solo recorrido. Las tres partes comparten `workflowSession` y
registran su trazabilidad en una única tabla general de MySQL.

## Arquitectura

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
- El escalamiento de sincronización SUMA solo admite
  `Escalamiento realizado`.
- En la etapa 3, `Falla en SMS` usa la misma ruta de soporte que
  `Falla en llamadas`.
- Las eSIM omiten cualquier prueba cruzada en otro dispositivo. Su reinicio usa
  modo avión, apagado durante 20 segundos y nuevo encendido, sin retirar la SIM.

## Archivos principales

- `Ningun Servicio Funciona - 1.json`
- `Ningun Servicio Funciona - 2.json`
- `Ningun Servicio Funciona - 3.json`
- `database/00_GestionesFlujosLog_Workbench.sql`
- `database/01_GestionesFlujosLog_Consultas.sql`
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
suma_ok = Si en respuestasJson
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

## Plantilla de escalamiento

Las salidas incluyen una plantilla desplegable y un botón para copiarla. El
contenido depende del proceso:

- QR vencido: fecha de expedición de la cédula, línea, descripción del error,
  observación con la solución requerida o resultado esperado, contacto y
  sistema operativo.
- Sincronización (ICCID o SUMA): fecha de expedición de la cédula, correo del
  cliente, cuenta de facturación, error, solución requerida y contacto.
- Vencimiento de NIP: no muestra plantilla. La venta se gestiona nuevamente
  según el procedimiento interno del aliado: formulario en Konecta, Soul en
  COS o la plataforma definida por el aliado.
- NIP recibido o pendiente dentro del plazo: no muestra plantilla. El caso se
  escala a CRM BAM porque la venta corresponde a otro aliado.
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
```

Si se regeneran los workflows con herramientas antiguas, vuelve a aplicar el
contrato del log general y después los ajustes operativos actuales:

```powershell
node tools/adaptar_log_general.js
node tools/aplicar_ajustes_operativos_202608.js
```
