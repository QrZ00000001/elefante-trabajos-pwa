# Elefante Trabajos PWA

Aplicación web progresiva para registrar, organizar y consultar los trabajos de producción de Elefante Difusión desde computador o teléfono.

> Estado: aplicación funcional para uso interno. Los trabajos se sincronizan con Google Sheets mediante Google Apps Script y pueden quedar guardados localmente cuando no hay conexión.

## Funciones principales

- Registro de trabajos para Impresión / Plotter y Trabajos Digitales.
- Edición directa de fecha, cliente, trabajo, medida, cantidad y terminaciones.
- Estados de producción: pendiente, impreso, entregado y atrasado.
- Búsqueda por cliente, trabajo o medida.
- Filtros por cliente, estado, mes y día.
- Historial mensual para separar y consultar períodos de trabajo.
- Sincronización automática por cada trabajo con Google Sheets.
- Cola local de cambios pendientes cuando no hay conexión a internet.
- Ingreso básico mediante comando de voz en navegadores compatibles.
- Diseño responsive e instalación como PWA en iPhone y Android.

## Tecnologías

- HTML, CSS y JavaScript sin dependencias.
- Google Sheets como base de datos operativa.
- Google Apps Script como servicio de sincronización.
- Web App Manifest y Service Worker para capacidades PWA.
- LocalStorage para respaldo local y trabajo sin conexión.

## Uso

1. Seleccionar el tipo de trabajo: **Impresión / Plotter** o **Trabajos Digitales**.
2. Pulsar **Añadir Trabajo** para crear un registro.
3. Completar o modificar los datos del trabajo.
4. Usar los filtros o el buscador para encontrar registros.
5. La app guarda los cambios automáticamente en Google Sheets.

En teléfono, los trabajos se muestran como tarjetas para facilitar su lectura y edición.

## Configuración de Google Sheets

1. Crear una hoja de cálculo de Google con una pestaña llamada `Trabajos`.
2. Abrir **Extensiones → Apps Script** en esa planilla.
3. Copiar el contenido de `GoogleAppsScript.gs` y desplegarlo como aplicación web.
4. Pegar la URL que termina en `/exec` en `main.js`, en `GOOGLE_SHEETS_API_URL`.
5. Publicar o servir la carpeta mediante HTTPS para usar la instalación PWA.

## Ejecutar localmente

Abrir `index.html` en un navegador moderno para revisar la interfaz.

Para probar sincronización, instalación PWA y Service Worker, servir la carpeta desde un servidor local o un sitio HTTPS. Estas capacidades no funcionan correctamente desde una dirección `file:///`.

## Estructura

```text
elefante-trabajos-pwa/
|-- index.html
|-- style.css
|-- main.js
|-- manifest.json
|-- sw.js
|-- GoogleAppsScript.gs
|-- icon-192.png
`-- icon-512.png
```

## Seguridad y privacidad

Esta versión está pensada para uso interno. Mientras la URL y la clave de Google Apps Script estén dentro de `main.js`, el repositorio debe mantenerse privado.

No se deben subir datos reales de clientes, trabajos o credenciales adicionales al repositorio.

## Próximos pasos

- Añadir inicio de sesión y permisos por usuario.
- Reemplazar la clave visible por una integración segura de producción.
- Incorporar formulario móvil para registrar trabajos con mayor rapidez.
- Añadir panel de producción con totales y métricas mensuales.
- Permitir adjuntar enlaces a archivos de diseño o producción.

## Autor

Desarrollado para Elefante Difusión como herramienta interna de gestión de producción.
