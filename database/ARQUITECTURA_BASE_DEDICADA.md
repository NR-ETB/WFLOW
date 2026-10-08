# Almacenamiento dedicado de gestiones

La decisión vigente cambia la propuesta anterior: se prepara **PostgreSQL en
CRM_N8N**, no otro MySQL. El servicio mostrado usa puerto interno 5432 y puerto
externo 3316. Se conserva el CRM original sin modificarlo.

El esquema `wflow` almacena datos operativos. No se migra la base interna de n8n,
sus workflows, sus credenciales ni su clave de cifrado. Un contenedor separado
aísla el servicio, pero no ofrece alta disponibilidad si comparte el mismo servidor.

La estructura, permisos, controles y procedimiento de corte están documentados
en [Instalación PostgreSQL](postgres/README.md). Los cuatro JSON ya usan el nodo
Postgres; no contienen contraseña. Las pruebas SQL locales no sustituyen una
validación de red, permisos y publicación en producción.

Estado: archivos preparados y pruebas locales ejecutadas. No se ha creado el
contenedor, aplicado SQL remoto, cambiado credenciales, publicado n8n ni trasladado
historial. Los scripts Workbench se mantienen como antecedentes MySQL y no deben
ejecutarse en esta nueva base.
