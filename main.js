const GOOGLE_SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbwZaxK7BMiuVaDsYMWQTR8dNDy_PvvmZFmzuEoNy-rK_r9G2sqYSCWMGqvkFSF5cwFAjQ/exec';
const GOOGLE_SHEETS_TOKEN = 'elefante-trabajos-2026-7c3f9a2d';

const state = { activeTab: 'plotter', jobs: { plotter: [], digital: [] } };
const pendingOperations = new Map();
let autoSyncTimer = null;
let syncInProgress = false;

const tabInputs = document.querySelectorAll('input[name="tab"]');
const views = { plotter: document.getElementById('view-plotter'), digital: document.getElementById('view-digital') };
const tbodys = { plotter: document.getElementById('tbody-plotter'), digital: document.getElementById('tbody-digital') };
const btnAdd = document.getElementById('btn-add-row');
const btnSync = document.getElementById('btn-sync');
const filters = {
    search: document.getElementById('filter-search'), client: document.getElementById('filter-client'),
    status: document.getElementById('filter-status'),
    month: document.getElementById('filter-month'), date: document.getElementById('filter-date')
};
const filterSummary = document.getElementById('filter-summary');
const customFilterSelects = [...document.querySelectorAll('.custom-filter-select')];

function sheetsConfigured() { return GOOGLE_SHEETS_API_URL.startsWith('https://script.google.com/'); }
function saveData() { localStorage.setItem('trabajosDelMes', JSON.stringify(state.jobs)); }
function savePending() { localStorage.setItem('trabajosPendientes', JSON.stringify([...pendingOperations.values()])); }
function loadData() {
    try {
        const saved = JSON.parse(localStorage.getItem('trabajosDelMes'));
        if (saved?.plotter && saved?.digital) state.jobs = saved;
        const pending = JSON.parse(localStorage.getItem('trabajosPendientes')) || [];
        pending.forEach(op => pendingOperations.set(op.id, op));
    } catch { localStorage.removeItem('trabajosPendientes'); }
}

async function requestSheets(accion, extra = {}) {
    const response = await fetch(GOOGLE_SHEETS_API_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ accion, token: GOOGLE_SHEETS_TOKEN, ...extra })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'No se pudo conectar con Google Sheets.');
    return data;
}

function applyOperation(jobs, operation) {
    const tab = operation.tipo;
    const index = jobs[tab].findIndex(job => String(job.id) === String(operation.id));
    if (operation.accion === 'eliminarTrabajo') {
        if (index >= 0) jobs[tab].splice(index, 1);
    } else if (index >= 0) jobs[tab][index] = operation.trabajo;
    else jobs[tab].push(operation.trabajo);
}

async function loadFromSheets() {
    if (!sheetsConfigured()) return;
    btnSync.innerText = 'Cargando...';
    try {
        const data = await requestSheets('cargar');
        state.jobs = data.trabajos;
        pendingOperations.forEach(operation => applyOperation(state.jobs, operation));
        saveData();
        renderTable();
        btnSync.innerText = pendingOperations.size ? 'Guardando...' : 'Sincronizado';
        if (pendingOperations.size) scheduleAutoSync();
    } catch (error) {
        console.warn('Se utilizará la copia local:', error);
        btnSync.innerText = 'Sin conexión';
    }
}

function queueUpsert(tab, job) {
    const operation = { accion: 'guardarTrabajo', tipo: tab, id: String(job.id), trabajo: { ...job } };
    pendingOperations.set(operation.id, operation);
    saveData(); savePending(); scheduleAutoSync();
}

function queueDelete(tab, id) {
    const operation = { accion: 'eliminarTrabajo', tipo: tab, id: String(id) };
    pendingOperations.set(operation.id, operation);
    saveData(); savePending(); scheduleAutoSync();
}

function scheduleAutoSync() {
    if (!sheetsConfigured() || pendingOperations.size === 0) return;
    clearTimeout(autoSyncTimer);
    btnSync.innerText = 'Guardando...';
    autoSyncTimer = setTimeout(() => syncPendingChanges(true), 600);
}

async function syncPendingChanges(silent = false) {
    if (!sheetsConfigured() || pendingOperations.size === 0) return;
    if (syncInProgress) return;
    clearTimeout(autoSyncTimer);
    syncInProgress = true;
    btnSync.disabled = true; btnSync.innerText = silent ? 'Guardando...' : 'Sincronizando...';
    try {
        for (const operation of [...pendingOperations.values()]) {
            await requestSheets(operation.accion, operation.accion === 'guardarTrabajo'
                ? { tipo: operation.tipo, trabajo: operation.trabajo }
                : { id: operation.id });
            if (pendingOperations.get(operation.id) === operation) pendingOperations.delete(operation.id);
        }
        savePending();
        btnSync.innerText = 'Sincronizado';
    } catch (error) {
        console.warn('Sincronización pendiente:', error);
        if (!silent) alert(`No se pudo sincronizar: ${error.message}`);
        btnSync.innerText = 'Reintentar sincronización';
    } finally {
        syncInProgress = false; btnSync.disabled = false;
        if (pendingOperations.size) scheduleAutoSync();
    }
}

function dateObject(value) {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
    const match = String(value).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : null;
}
function dateKey(value) {
    const date = dateObject(value);
    return date && !Number.isNaN(date) ? date.toISOString().slice(0, 10) : '';
}
function monthKey(value) { return dateKey(value).slice(0, 7); }
function statusOf(job) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const date = dateObject(job.fecha);
    if (!job.entregado && date && date < today) return 'overdue';
    if (job.entregado) return 'delivered';
    if (job.impreso) return 'printed';
    return 'pending';
}
function statusLabel(status) { return ({ pending: 'Pendiente', printed: 'Impreso', delivered: 'Entregado', overdue: 'Atrasado' })[status]; }
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
function jobMatches(job) {
    const search = filters.search.value.trim().toLocaleLowerCase();
    const haystack = `${job.cliente} ${job.trabajo} ${job.medida || job.formato || ''}`.toLocaleLowerCase();
    return (!search || haystack.includes(search))
        && (!filters.client.value || job.cliente === filters.client.value)
        && (!filters.status.value || statusOf(job) === filters.status.value)
        && (!filters.month.value || monthKey(job.fecha) === filters.month.value)
        && (!filters.date.value || dateKey(job.fecha) === filters.date.value);
}

function updateFilterOptions() {
    const jobs = state.jobs[state.activeTab];
    const selectedClient = filters.client.value;
    const clients = [...new Set(jobs.map(job => job.cliente).filter(Boolean))].sort();
    filters.client.innerHTML = '<option value="">Todos los clientes</option>' + clients.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    if (clients.includes(selectedClient)) filters.client.value = selectedClient;
    renderCustomFilterSelects();
}

function renderCustomFilterSelects() {
    customFilterSelects.forEach(container => {
        const select = document.getElementById(container.dataset.filter);
        const button = container.querySelector('button');
        const menu = container.querySelector('.custom-filter-menu');
        const selected = select.options[select.selectedIndex];
        button.textContent = selected?.textContent || 'Seleccionar';
        menu.innerHTML = [...select.options].map(option =>
            `<button type="button" class="${option.value === select.value ? 'selected' : ''}" data-value="${escapeHtml(option.value)}">${escapeHtml(option.textContent)}</button>`
        ).join('');
    });
}

customFilterSelects.forEach(container => {
    const select = document.getElementById(container.dataset.filter);
    const button = container.querySelector('button');
    const menu = container.querySelector('.custom-filter-menu');
    button.addEventListener('click', event => {
        event.stopPropagation();
        customFilterSelects.forEach(item => { if (item !== container) item.classList.remove('open'); });
        container.classList.toggle('open');
    });
    menu.addEventListener('click', event => {
        const option = event.target.closest('button[data-value]');
        if (!option) return;
        select.value = option.dataset.value;
        container.classList.remove('open');
        select.dispatchEvent(new Event('input', { bubbles: true }));
    });
});
document.addEventListener('click', () => customFilterSelects.forEach(container => container.classList.remove('open')));

function renderTable() {
    const tab = state.activeTab;
    updateFilterOptions();
    const tbody = tbodys[tab]; tbody.innerHTML = '';
    const visible = state.jobs[tab].map((job, index) => ({ job, index })).filter(({ job }) => jobMatches(job));
    visible.forEach(({ job, index }) => {
        const tr = document.createElement('tr');
        const status = statusOf(job); tr.className = `row-status-${status}`;
        const badge = `<span class="status-badge status-${status}">${statusLabel(status)}</span>`;
        if (tab === 'plotter') {
            tr.innerHTML = `
                <td><div class="editable" contenteditable="true" onblur="updateField('${tab}', ${index}, 'fecha', this.innerText)">${escapeHtml(job.fecha)}</div></td>
                <td><div class="editable" contenteditable="true" onblur="updateField('${tab}', ${index}, 'cliente', this.innerText)">${escapeHtml(job.cliente)}</div></td>
                <td><div class="editable" contenteditable="true" onblur="updateField('${tab}', ${index}, 'trabajo', this.innerText)">${escapeHtml(job.trabajo)}</div></td>
                <td><div class="editable" contenteditable="true" onblur="updateField('${tab}', ${index}, 'medida', this.innerText)">${escapeHtml(job.medida)}</div></td>
                <td><div class="editable" contenteditable="true" onblur="updateField('${tab}', ${index}, 'cantidad', this.innerText)">${escapeHtml(job.cantidad)}</div></td>
                <td><select class="table-select" onchange="updateField('${tab}', ${index}, 'unidad', this.value)"><option value="Pliegos" ${job.unidad === 'Pliegos' ? 'selected' : ''}>Pliegos</option><option value="m²" ${job.unidad === 'm²' ? 'selected' : ''}>m²</option><option value="Unidades" ${job.unidad === 'Unidades' ? 'selected' : ''}>Unidades</option></select></td>
                <td><select class="table-select" onchange="updateField('${tab}', ${index}, 'terminacion', this.value)">
                    <option value="BARNIZ" ${job.terminacion === 'BARNIZ' ? 'selected' : ''}>BARNIZ</option>
                    <option value="BARNIZ + MEDIO CORTE" ${job.terminacion === 'BARNIZ + MEDIO CORTE' ? 'selected' : ''}>BARNIZ + MEDIO CORTE</option>
                    <option value="BARNIZ + DOBLE CORTE" ${job.terminacion === 'BARNIZ + DOBLE CORTE' ? 'selected' : ''}>BARNIZ + DOBLE CORTE</option>
                    <option value="BLANCO" ${job.terminacion === 'BLANCO' ? 'selected' : ''}>BLANCO</option>
                    <option value="BLANCO + BARNIZ" ${job.terminacion === 'BLANCO + BARNIZ' ? 'selected' : ''}>BLANCO + BARNIZ</option>
                    <option value="BLANCO + MEDIO CORTE" ${job.terminacion === 'BLANCO + MEDIO CORTE' ? 'selected' : ''}>BLANCO + MEDIO CORTE</option>
                    <option value="BLANCO + DOBLE CORTE" ${job.terminacion === 'BLANCO + DOBLE CORTE' ? 'selected' : ''}>BLANCO + DOBLE CORTE</option>
                    <option value="BLANCO + BARNIZ + MEDIO CORTE" ${job.terminacion === 'BLANCO + BARNIZ + MEDIO CORTE' ? 'selected' : ''}>BLANCO + BARNIZ + MEDIO CORTE</option>
                    <option value="BLANCO + BARNIZ + DOBLE CORTE" ${job.terminacion === 'BLANCO + BARNIZ + DOBLE CORTE' ? 'selected' : ''}>BLANCO + BARNIZ + DOBLE CORTE</option>
                </select></td>
                <td><div class="custom-checkbox ${job.impreso ? 'checked' : ''}" onclick="toggleCheck('${tab}', ${index}, 'impreso')"></div></td>
                <td><div class="custom-checkbox ${job.entregado ? 'checked' : ''}" onclick="toggleCheck('${tab}', ${index}, 'entregado')"></div></td>
                <td>${badge}<button class="btn-icon" title="Eliminar trabajo" onclick="deleteRow('${tab}', ${index})">🗑</button></td>`;
        } else {
            tr.innerHTML = `
                <td><div class="editable" contenteditable="true" onblur="updateField('${tab}', ${index}, 'fecha', this.innerText)">${escapeHtml(job.fecha)}</div></td>
                <td><div class="editable" contenteditable="true" onblur="updateField('${tab}', ${index}, 'cliente', this.innerText)">${escapeHtml(job.cliente)}</div></td>
                <td><div class="editable" contenteditable="true" onblur="updateField('${tab}', ${index}, 'trabajo', this.innerText)">${escapeHtml(job.trabajo)}</div></td>
                <td><div class="editable" contenteditable="true" onblur="updateField('${tab}', ${index}, 'formato', this.innerText)">${escapeHtml(job.formato)}</div></td>
                <td><div class="editable" contenteditable="true" onblur="updateField('${tab}', ${index}, 'cantidad', this.innerText)">${escapeHtml(job.cantidad)}</div></td>
                <td><div class="custom-checkbox ${job.entregado ? 'checked' : ''}" onclick="toggleCheck('${tab}', ${index}, 'entregado')"></div></td>
                <td>${badge}<button class="btn-icon" title="Eliminar trabajo" onclick="deleteRow('${tab}', ${index})">🗑</button></td>`;
        }
        const labels = tab === 'plotter'
            ? ['Fecha', 'Cliente', 'Trabajo', 'Medida', 'Cantidad', 'Unidad', 'Terminación', 'Impreso', 'Entregado', 'Estado']
            : ['Fecha', 'Cliente', 'Trabajo', 'Formato', 'Cantidad', 'Entregado', 'Estado'];
        tr.querySelectorAll('td').forEach((cell, cellIndex) => { cell.dataset.label = labels[cellIndex]; });
        tbody.appendChild(tr);
    });
    filterSummary.textContent = `${visible.length} de ${state.jobs[tab].length} trabajo${state.jobs[tab].length === 1 ? '' : 's'} visibles`;
}

function newId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
window.updateField = (tab, index, field, value) => { const job = state.jobs[tab][index]; job[field] = value.trim(); queueUpsert(tab, job); renderTable(); };
window.toggleCheck = (tab, index, field) => { const job = state.jobs[tab][index]; job[field] = !job[field]; queueUpsert(tab, job); renderTable(); };
window.deleteRow = (tab, index) => {
    const job = state.jobs[tab][index];
    if (confirm(`¿Eliminar el trabajo de ${job.cliente || 'este cliente'}?`)) { state.jobs[tab].splice(index, 1); queueDelete(tab, job.id); renderTable(); }
};

tabInputs.forEach(input => input.addEventListener('change', event => {
    state.activeTab = event.target.value;
    Object.values(views).forEach(view => view.classList.remove('active'));
    views[state.activeTab].classList.add('active'); renderTable();
}));
Object.values(filters).forEach(input => input.addEventListener('input', renderTable));
document.getElementById('btn-clear-filters').addEventListener('click', () => { Object.values(filters).forEach(input => input.value = ''); renderTable(); });
btnAdd.addEventListener('click', () => {
    const tab = state.activeTab, fecha = new Date().toISOString().slice(0, 10);
    const job = tab === 'plotter'
        ? { id: newId(), fecha, cliente: 'Nuevo', trabajo: '-', medida: '-', cantidad: '1', unidad: 'Unidades', terminacion: 'BARNIZ', impreso: false, entregado: false }
        : { id: newId(), fecha, cliente: 'Nuevo', trabajo: '-', formato: '-', cantidad: '1', entregado: false };
    state.jobs[tab].push(job); queueUpsert(tab, job); renderTable();
});
btnSync.addEventListener('click', () => syncPendingChanges(false));

const btnVoice = document.getElementById('btn-voice');
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition(); recognition.lang = 'es-CL'; recognition.continuous = false;
    btnVoice.addEventListener('click', () => { btnVoice.classList.add('listening'); recognition.start(); });
    recognition.onresult = event => {
        btnVoice.classList.remove('listening'); const text = event.results[0][0].transcript.toLowerCase();
        const cliente = (text.match(/cliente\s+([a-zá-úñ\s]+)(?=\s+\d+|$)/i)?.[1] || 'Voz (Revisar)').trim().toUpperCase();
        const cantidad = text.match(/(\d+)/)?.[1] || '1'; const tab = state.activeTab;
        const job = tab === 'plotter'
            ? { id: newId(), fecha: new Date().toISOString().slice(0, 10), cliente, trabajo: 'Ingresado por voz', medida: '-', cantidad, unidad: text.includes('metro') || text.includes('m2') ? 'm²' : 'Unidades', terminacion: 'BARNIZ', impreso: false, entregado: false }
            : { id: newId(), fecha: new Date().toISOString().slice(0, 10), cliente, trabajo: 'Ingresado por voz', formato: '-', cantidad, entregado: false };
        state.jobs[tab].push(job); queueUpsert(tab, job); renderTable();
    };
    recognition.onerror = event => { btnVoice.classList.remove('listening'); alert(`Error al escuchar: ${event.error}`); };
} else btnVoice.style.display = 'none';

loadData(); renderTable(); loadFromSheets();
