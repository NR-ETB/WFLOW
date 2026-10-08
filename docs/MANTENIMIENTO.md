# Mantenimiento de los workflows

## Fuente vigente y herramientas

Los cuatro JSON raíz son la fuente actual de la lógica operativa. Editar el
nodo correspondiente, ejecutar `node tools/preparar_postgres.js` y revisar el
diff. Ese comando aplica contrato PostgreSQL, organización y diez suites.

`generar_flujo0.js` puede reconstruir el registro inicial, ya con PostgreSQL y
stickies. Después ejecutar `preparar_postgres.js` para homogeneizar y validar.
Los generadores históricos de las etapas 1–3 no son un pipeline vigente:
dependen de archivos anteriores o instalan SQL MySQL. No ejecutarlos de forma
aislada sobre los JSON nuevos. Si se recupera una fuente histórica, se debe
aplicar toda la cadena de adaptaciones y validar antes de sustituir los archivos.

`postgres_consultas.js` es la fuente de las consultas nuevas. Los parámetros
siempre se envían como un array de expresiones a un nodo Postgres v2.6.
No concatenar respuestas del asesor dentro del SQL. No incluir credenciales,
contraseñas ni datos personales de ejemplo en JSON, notas o capturas de pruebas.

## Bloques visuales

`organizar_workflows.js` contiene la clasificación semántica y el layout. Los
bloques siguen orden de lectura de izquierda a derecha y luego la siguiente
fila. Las ramas de retorno pueden cruzar bloques; las conexiones no se alteran.
Los nodos conservan sus nombres e IDs, excepto el nombre de los nodos MySQL
convertidos a PostgreSQL.

Para revisar una vista local del layout, ejecutar `node tools/generar_mapa_workflows.js`
y abrir `preview/workflows/index.html`. El mapa conserva posiciones y conexiones,
pero no sustituye revisar el canvas importado en n8n.

- Flujo 0: apertura; recepción; guardado; reintento.
- Etapa 1: entrada; línea/cobertura; pagos; ICCID; IMEI/bloqueo;
  documentación/SIM; persistencia.
- Etapa 2: entrada; SIM/QR; portación/NIP; escalamiento por aliado;
  SUMA/cierre; persistencia.
- Etapa 3: entrada; configuración; prueba física; reinicio;
  resultados técnicos; log/resumen; cierre/contingencia.

Cada sticky debe tener título numerado, propósito, regla, salidas y mantenimiento.
Cada nodo funcional debe estar dentro de exactamente una sticky. Añadir un nodo
requiere actualizar su clasificación; el script falla si hay ambigüedad, un nodo
sin bloque o una sticky sin nodos. Los tests verifican límites, separaciones,
IDs, nombres, referencias y ausencia de bloques superpuestos.

## Persistencia y errores

No confirmar al asesor una operación si el nodo de la base no devolvió la
referencia esperada. Los nodos de confirmación rechazan resultados vacíos o de
otra sesión. No eliminar sus salidas de error ni conectarlas al cierre exitoso.
Los nodos de PostgreSQL tienen respuesta de error controlada y el detalle técnico
queda en `persistence_diagnostic` de la ejecución.

Flujo 0 permite reintentar con campos y referencia originales. Etapa 2 conserva
su cierre mediante webhook estable. En una contingencia de etapa 1 o 3, retomar
conserva las etapas guardadas, pero puede requerir repetir últimas validaciones;
no se presenta como recuperación automática de una pantalla Wait consumida.

La base guarda el último estado de cada etapa/intento, no cada interacción.
Las columnas `execution_id` y `workflow_version` permiten relacionarlo con
ejecuciones n8n. La versión de los cuatro workflows debe publicarse como conjunto.

## Aceptación en n8n

1. Prueba desde flujo 0 con datos ficticios controlados, nunca contraseñas.
2. Confirma cabecera y log inicial antes de continuar.
3. Recorre ambas opciones SUMA con recursos y el cierre sin recursos.
4. Prueba QR funcional, QR con falla y QR después de 24 horas.
5. Prueba NIP recibido, pendiente y vencido; verifica salidas y plantillas.
6. Prueba configuración, prueba cruzada física, reinicio eSIM y segundo nivel.
7. Confirma resumen, datos originales y observaciones en base y log.
8. Simula pérdida de conexión en un entorno de prueba: no debe aparecer SQL,
   credencial o tabla en la pantalla, ni una confirmación falsa.
9. Revisa el canvas importado: notas legibles, bloques y conexiones. La prueba
   geométrica local no comprueba cómo los renderiza tu versión de n8n.

No publicar cambios sin aceptar estas pruebas. Conservar la versión anterior y
su respaldo; el retorno requiere conciliar también las escrituras nuevas.
