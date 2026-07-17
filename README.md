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
```

Si se regeneran los workflows con herramientas antiguas, vuelve a aplicar el
contrato del log general:

```powershell
node tools/adaptar_log_general.js
```
