# WFLOW · registro inicial y diagnóstico ETB

Cuatro workflows de n8n comparten una única referencia de gestión. La versión
vigente usa **PostgreSQL en CRM_N8N**, con tablas operativas en el esquema
`wflow`. No modifica la base interna de n8n.

## Entrada común

Iniciar siempre en `/webhook/etb-form-inicial`, sin parámetros. Flujo 0 genera
la referencia y solicita usuario del asesor, número de conexión y PQR. Los tres
campos son obligatorios, texto de hasta 100 caracteres. No se solicita contraseña;
el usuario es un dato operativo, no una autenticación. Ceros iniciales se conservan.

El formulario envía POST a `/webhook/etb-form-inicial-guardar`. Usuario, conexión
y PQR no se envían en la URL. Una operación atómica guarda cabecera y log. Un
reintento conserva los valores originales y la referencia. Solo después de
confirmar el guardado aparece `Continuar al diagnóstico`.

Las etapas 1–3 no generan otra sesión. La etapa 1 comprueba cabecera y log inicial;
un acceso sin inicio confirmado vuelve al flujo 0. Las etapas 2 y 3 comprueban
además el contexto anterior. Las restricciones de la base impiden guardar
diagnósticos sin inicio confirmado o reasignar una fila a otra gestión.

## Archivos vigentes

- `Flujo 0 - Registro Inicial.json`: entrada común, registro, confirmación y reintento.
- `Ningun Servicio Funciona - 1.json`: línea, cobertura, pagos, ICCID, IMEI y SIM.
- `Ningun Servicio Funciona - 2.json`: QR, portación, NIP y recursos SUMA.
- `Ningun Servicio Funciona - 3.json`: configuración, pruebas técnicas y cierre.
- `database/postgres/00_Estructura.sql`: estructura operativa nueva y restricciones.
- `database/postgres/01_Verificacion.sql`: controles de integridad, solo lectura.
- [Instalación PostgreSQL](database/postgres/README.md): conexión, permisos y corte.
- [Mantenimiento](docs/MANTENIMIENTO.md): organización, regeneración y pruebas.

Los scripts MySQL `*_Workbench.sql` son históricos. **No ejecutarlos en PostgreSQL.**
La instalación nueva no copia automáticamente registros del CRM. El historial
sin flujo 0 verificable debe conservarse por separado; no se inventan datos.

## Instalación

1. Confirmar PostgreSQL 14+ y conectar a `CRM_N8N`. Respaldar y planificar el corte
   antes de cambiar una instalación activa.
2. Ejecutar completo `database/postgres/00_Estructura.sql`.
3. Crear una credencial **Postgres** en n8n. Asignarla a los diez nodos de
   persistencia de los cuatro JSON, incluidas las consultas y las observaciones.
4. Importar y publicar los cuatro workflows compatibles. Iniciar una gestión nueva
   desde flujo 0. Las ejecuciones Wait antiguas mantienen su versión anterior.
5. Probar todas las salidas y ejecutar `database/postgres/01_Verificacion.sql`.

Conexión interna mostrada: host `crm-crmdbn8n-fkjhdz`, puerto `5432`,
base `CRM_N8N`, usuario `crm_user_n8n`. Confirmar host y red compartida en Docker.
`3316` es el puerto externo del servidor, no el puerto interno de PostgreSQL.
La contraseña no se incluye en archivos ni Git. Rotar la expuesta en la captura.

## Registro y trazabilidad

`wflow.gestiones` conserva usuario/conexión/PQR originales por sesión.
`wflow.gestiones_log` contiene respuestas, contexto, estado, resultado, siguiente
paso, ejecución, versión y fechas. Sus triggers copian los datos iniciales a
columnas y JSON de todas las etapas.

La clave del log es `workflow_session + codigo_flujo + codigo_etapa + numero_intento`.
El UPSERT permite reintentar sin duplicar la etapa. El log guarda el estado actual
por etapa/intento, no cada clic del asesor. Los errores técnicos de persistencia
permanecen en la ejecución n8n; la pantalla recibe una respuesta controlada.
Una operación sin confirmación no se presenta como guardada.

| Parte | Código de flujo | Código de etapa | Número |
|---|---|---|---:|
| Registro inicial | inicioGestion | registroInicial | 0 |
| Validaciones iniciales | ningunServicioFunciona | validacionServicio | 1 |
| Diagnóstico SIM | ningunServicioFunciona | diagnosticoSim | 2 |
| Configuración de equipo | ningunServicioFunciona | configuracionEquipo | 3 |

Vistas generales: `wflow.vw_gestiones_trazabilidad` y `wflow.vw_gestiones_resumen`.
Vistas del diagnóstico: `wflow.vw_nsf_trazabilidad` y `wflow.vw_nsf_resumen`.

## Reglas operativas conservadas

- Cobertura y viaje: cuatro combinaciones. Abrir el mapa ETB es obligatorio para
  continuar; la pantalla muestra ese requisito.
- Pagos: cuenta al día muestra Siguiente; saldo pendiente exige Confirmar y reconectar.
- IMEI: abrir consulta pública es obligatorio. IMEI bloqueado/no registrado
  deriva a documentación, cuyo canal se registra.
- Únicamente SIM física y eSIM.
- QR: instalado/reutilizado dentro de 24 horas conduce a confirmar funcionalidad.
  Si funciona, cierra como `servicio_normalizado_qr`; si falla, continúa soporte.
  QR sin funcionar tras 24 horas requiere escalamiento y plantilla específica.
- NIP recibido o pendiente: CRM BAM, sin plantilla, porque la venta corresponde
  a otro aliado. Vencimiento: nueva gestión según procedimiento del aliado
  (formulario Konecta, Soul COS), sin plantilla; una sola confirmación de escalamiento.
- SUMA: Activo y con recursos (pospago), Activo y con recursos (prepago), Activo
  sin recursos o recursos incompletos (prepago). Las dos primeras siguen a etapa 3.
  La tercera muestra cierre `no_aplica_sin_recursos`: no aplica falla si faltan
  datos, minutos o SMS necesarios para el servicio afectado.
- Cierres de etapa 2 usan `etb-form-parte-2-continuar`, no un Wait terminado.
- SMS sigue la ruta de llamadas en etapa 3. eSIM omite prueba cruzada física;
  reinicia con modo avión, apagado por 20 segundos y encendido, sin retirar SIM.
- Configuración de smartphone exige abrir el enlace indicado.
- El cierre técnico se guarda como PendienteCierre y abre el resumen de esta
  sesión con datos iniciales. Observaciones del asesor: obligatorias, 10–2000
  caracteres. Se agregan a respuestas y contexto antes de confirmar el cierre.

## Plantillas

- QR: fecha de expedición de cédula, línea, error, solución requerida/resultado
  esperado, contacto y sistema operativo.
- Sincronización ICCID: fecha de expedición de cédula, correo del cliente,
  cuenta de facturación, error, solución requerida y contacto.
- Segundo nivel: USUARIO, CANAL, TIPO DE FALLA, IMEI, MODELO / MARCA / EQUIPO,
  BLOQUEO, NOMBRE, CC / CÉDULA, LÍNEA, CONTACTO, CIUDAD, BARRIO, CHARGING y SAAW.
- CRM BAM, NIP vencido y cierre sin recursos: sin plantilla.

Las plantillas se muestran y copian para diligenciar en el canal operativo;
sus datos personales no se envían en la URL ni se guardan automáticamente.

## Organización y pruebas

Los cuatro archivos contienen 24 stickies numeradas, con propósito, regla,
salidas y mantenimiento. Cada nodo funcional pertenece a exactamente un bloque.
No hay stickies vacías ni bloques superpuestos. La organización se puede repetir
sin cambiar la lógica ni las conexiones.

Los JSON son la fuente vigente de la lógica operativa. No ejecutar generadores
históricos directamente: algunos requieren la versión v10 no incluida y otros
restauran MySQL. Para adaptar y validar los archivos vigentes:

```powershell
npm install --prefix preview/test-postgres --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.3.14
node tools/preparar_postgres.js
```

Diez suites comprueban formularios, rutas, plantillas, sesiones, cierres y layout.
Las consultas y el DDL se ejecutan también en PostgreSQL local en memoria.
No se conecta a producción. Ver instrucciones completas en `database/postgres/README.md`.
