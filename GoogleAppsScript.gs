/** Base de datos para Trabajos del Mes (versión por registro). */
const NOMBRE_HOJA = 'Trabajos';
const TOKEN_APP = 'elefante-trabajos-2026-7c3f9a2d';
const ENCABEZADOS = [
  'id', 'tipo', 'fecha', 'cliente', 'trabajo', 'medida_formato',
  'cantidad', 'unidad', 'terminacion', 'maquina', 'impreso', 'entregado',
  'actualizado_en'
];

function doGet() {
  return respuesta_({ ok: true, mensaje: 'Servicio Trabajos del Mes activo.' });
}

function doPost(e) {
  try {
    const datos = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (datos.token !== TOKEN_APP) return respuesta_({ ok: false, error: 'No autorizado.' });

    if (datos.accion === 'cargar') return respuesta_({ ok: true, trabajos: leerTrabajos_() });
    if (datos.accion === 'guardarTrabajo') {
      guardarTrabajo_(datos.tipo, datos.trabajo || {});
      return respuesta_({ ok: true });
    }
    if (datos.accion === 'eliminarTrabajo') {
      eliminarTrabajo_(String(datos.id || ''));
      return respuesta_({ ok: true });
    }
    return respuesta_({ ok: false, error: 'Acción no reconocida.' });
  } catch (error) {
    return respuesta_({ ok: false, error: error.message });
  }
}

function hoja_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(NOMBRE_HOJA) || libro.insertSheet(NOMBRE_HOJA);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, ENCABEZADOS.length).setValues([ENCABEZADOS]);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, ENCABEZADOS.length)
      .setFontWeight('bold').setBackground('#0071e3').setFontColor('#ffffff');
    hoja.autoResizeColumns(1, ENCABEZADOS.length);
  }
  return hoja;
}

function leerTrabajos_() {
  const filas = hoja_().getDataRange().getValues();
  const trabajos = { plotter: [], digital: [] };
  filas.slice(1).forEach(fila => {
    if (!fila[0]) return;
    const trabajo = {
      id: String(fila[0]), fecha: String(fila[2] || ''), cliente: String(fila[3] || ''),
      trabajo: String(fila[4] || ''), cantidad: String(fila[6] || ''), entregado: fila[11] === true
    };
    if (fila[1] === 'digital') {
      trabajo.formato = String(fila[5] || '');
      trabajos.digital.push(trabajo);
    } else {
      trabajo.medida = String(fila[5] || '');
      trabajo.unidad = String(fila[7] || 'Unidades');
      trabajo.terminacion = String(fila[8] || '');
      trabajo.maquina = String(fila[9] || '');
      trabajo.impreso = fila[10] === true;
      trabajos.plotter.push(trabajo);
    }
  });
  return trabajos;
}

function guardarTrabajo_(tipo, trabajo) {
  if (tipo !== 'plotter' && tipo !== 'digital') throw new Error('Tipo de trabajo inválido.');
  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(10000);
  try {
    const hoja = hoja_();
    const id = String(trabajo.id || Utilities.getUuid());
    const fila = filaTrabajo_(hoja, id);
    const valores = [filaDatos_(tipo, { ...trabajo, id })];
    if (fila) hoja.getRange(fila, 1, 1, ENCABEZADOS.length).setValues(valores);
    else hoja.getRange(hoja.getLastRow() + 1, 1, 1, ENCABEZADOS.length).setValues(valores);
  } finally {
    bloqueo.releaseLock();
  }
}

function eliminarTrabajo_(id) {
  if (!id) throw new Error('Falta el identificador del trabajo.');
  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(10000);
  try {
    const hoja = hoja_();
    const fila = filaTrabajo_(hoja, id);
    if (fila) hoja.deleteRow(fila);
  } finally {
    bloqueo.releaseLock();
  }
}

function filaTrabajo_(hoja, id) {
  if (hoja.getLastRow() < 2) return 0;
  const ids = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
  const indice = ids.findIndex(fila => String(fila[0]) === id);
  return indice < 0 ? 0 : indice + 2;
}

function filaDatos_(tipo, t) {
  const ahora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return [
    t.id, tipo, t.fecha || '', t.cliente || '', t.trabajo || '',
    tipo === 'digital' ? (t.formato || '') : (t.medida || ''), String(t.cantidad || ''),
    tipo === 'digital' ? '' : (t.unidad || 'Unidades'),
    tipo === 'digital' ? '' : (t.terminacion || ''),
    tipo === 'digital' ? '' : (t.maquina || ''),
    tipo === 'plotter' && t.impreso === true, t.entregado === true, ahora
  ];
}

function respuesta_(contenido) {
  return ContentService.createTextOutput(JSON.stringify(contenido))
    .setMimeType(ContentService.MimeType.JSON);
}
