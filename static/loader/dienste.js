var bigDiv = document.getElementById("inner-grid");

function init() {
  bigDiv.innerHTML = '<div class="spacer" id="heading"><h2>Dienste</h2></div>';
  document.getElementById("status-text").innerHTML = "Dienste konfigurieren";

  fetch("/admin/loader/dienste.html")
    .then(function(res) { return res.text(); })
    .then(function(html) {
      bigDiv.innerHTML += html;
      // Move overlay elements to document.body to escape any ancestor stacking context
      // created by grid-item (backdrop-filter/filter on .grid-item traps position:fixed children)
      ['dc-backdrop', 'dc-sheet', 'dc-toast', 'dc-save-bar'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) document.body.appendChild(el);
      });
      dcLoadConfig();
    })
    .catch(function(err) { console.error("Failed to load dienste:", err); });
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

var DC_USE_DEMO_DATA = false;
var DC_API_BASE_GET = '/moodle/api/dienste';
var DC_API_BASE_PUT = '/admin/moodle/api/dienste';

var DC_COLOR_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#10b981', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#78716c', '#0f172a'
];

var DC_DEMO_CONFIG = {
  day: { name: 'Sommerfest', date: '2026-06-21' },
  timeRange: { start: '12:00', end: '22:00' },
  categories: [
    { id: 'cat_aufbau',   name: 'Aufbau',         color: '#10b981' },
    { id: 'cat_geschirr', name: 'Geschirrdienst', color: '#3b82f6' },
    { id: 'cat_kasse',    name: 'Kasse',          color: '#f59e0b' },
    { id: 'cat_kuche',    name: 'Küche',          color: '#a855f7' },
    { id: 'cat_abbau',    name: 'Abbau',          color: '#ef4444' }
  ],
  events: [
    { id: 'e1', categoryId: 'cat_aufbau',   start: '12:00', end: '14:00', description: 'Bühne + Bestuhlung', isShadow: false, slots: 1, assignments: [{ person: 'Lisa Müller', class: '9b' }] },
    { id: 'e2', categoryId: 'cat_geschirr', start: '16:00', end: '17:00', description: '',                   isShadow: false, slots: 1, assignments: [{ person: 'Max Mustermann', class: '8e' }] },
    { id: 'e3', categoryId: 'cat_kuche',    start: '15:00', end: '18:00', description: 'Grillstation',       isShadow: false, slots: 1, assignments: [{ person: 'Tom Becker', class: '10a' }] },
    { id: 's1', categoryId: 'cat_geschirr', start: '17:00', end: '18:00', description: 'Nach Hauptgang',     isShadow: true,  slots: 3, assignments: [{ person: 'Tom Becker', class: '7t' }, { person: 'Janne H.', class: '7u' }] },
    { id: 's2', categoryId: 'cat_kasse',    start: '15:00', end: '17:00', description: 'Eingangskasse',      isShadow: true,  slots: 2, assignments: [] },
    { id: 's3', categoryId: 'cat_kasse',    start: '17:00', end: '19:00', description: 'Eingangskasse',      isShadow: true,  slots: 2, assignments: [{ person: 'Anna K.', class: '9c' }] },
    { id: 's4', categoryId: 'cat_abbau',    start: '21:00', end: '22:00', description: 'Stuhltransport',     isShadow: true,  slots: 4, assignments: [] }
  ]
};

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

var dcState = {
  config: null,
  original: null,
  sheetData: null
};

function dcEl(id) { return document.getElementById(id); }
function dcEscapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function dcGenId(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }
function dcIsDirty() { return JSON.stringify(dcState.config) !== JSON.stringify(dcState.original); }

// ─────────────────────────────────────────────────────────────────────────────
// Load & Render
// ─────────────────────────────────────────────────────────────────────────────

async function dcLoadConfig() {
  try {
    if (DC_USE_DEMO_DATA) {
      dcState.config = JSON.parse(JSON.stringify(DC_DEMO_CONFIG));
    } else {
      var res = await fetch(DC_API_BASE_GET + '/config');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      dcState.config = await res.json();
    }
    dcState.original = JSON.parse(JSON.stringify(dcState.config));
    dcRender();
  } catch (e) {
    dcShowToast('Fehler beim Laden: ' + e.message, true);
    dcEl('dc-main').innerHTML = '<div class="dc-loader-msg">Verbindungsfehler: ' + dcEscapeHtml(e.message) + '</div>';
  }
}

function dcRender() {
  if (!dcState.config) return;
  var cfg = dcState.config;
  var shadows = cfg.events.filter(function(e) { return e.isShadow; });

  dcEl('dc-main').innerHTML = '\
    <section>\
      <div class="dc-section-header">\
        <div class="dc-section-title">Allgemein</div>\
      </div>\
      <div class="dc-field">\
        <label class="dc-field-label">Bezeichnung</label>\
        <input class="dc-input" id="dc-day-name" value="' + dcEscapeHtml(cfg.day.name || '') + '" placeholder="z.B. Sommerfest">\
      </div>\
      <div class="dc-field">\
        <label class="dc-field-label">Datum</label>\
        <input class="dc-input" type="date" id="dc-day-date" value="' + (cfg.day.date || '') + '">\
      </div>\
      <div class="dc-field-row">\
        <div class="dc-field">\
          <label class="dc-field-label">Zeit von</label>\
          <input class="dc-input" type="time" id="dc-range-start" value="' + cfg.timeRange.start + '">\
        </div>\
        <div class="dc-field">\
          <label class="dc-field-label">Zeit bis</label>\
          <input class="dc-input" type="time" id="dc-range-end" value="' + cfg.timeRange.end + '">\
        </div>\
      </div>\
    </section>\
    <section>\
      <div class="dc-section-header">\
        <div class="dc-section-title">Kategorien</div>\
        <button class="dc-section-add" onclick="dcOpenCategoryModal()">Hinzufügen</button>\
      </div>\
      <div class="dc-item-list" id="dc-cat-list">\
        ' + (cfg.categories.length === 0
          ? '<div class="dc-empty-list">Noch keine Kategorien</div>'
          : cfg.categories.map(function(c) {
              return '<div class="dc-item">\
                <span class="dc-item-color-dot" style="background:' + c.color + '"></span>\
                <div class="dc-item-body">\
                  <div class="dc-item-title">' + dcEscapeHtml(c.name) + '</div>\
                  <div class="dc-item-sub">' + c.color + '</div>\
                </div>\
                <div class="dc-item-actions">\
                  <button class="dc-item-btn" onclick="dcOpenCategoryModal(\'' + c.id + '\')" title="Bearbeiten">\
                    <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>\
                  </button>\
                  <button class="dc-item-btn dc-danger" onclick="dcDeleteCategory(\'' + c.id + '\')" title="Löschen">\
                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>\
                  </button>\
                </div>\
              </div>';
            }).join('')) + '\
      </div>\
    </section>\
    <section>\
      <div class="dc-section-header">\
        <div class="dc-section-title">Template-Events</div>\
        <button class="dc-section-add" onclick="dcOpenShadowModal()">Hinzufügen</button>\
      </div>\
      <div class="dc-item-list">\
        ' + (shadows.length === 0
          ? '<div class="dc-empty-list">Keine Template-Slots — Nutzer tragen frei ein</div>'
          : shadows.map(function(s) {
              var cat = cfg.categories.find(function(c) { return c.id === s.categoryId; });
              var color = cat ? cat.color : '#78716c';
              var catName = cat ? cat.name : 'Unbekannt';
              var slots = s.slots || 1;
              var filled = (s.assignments || []).length;
              return '<div class="dc-item">\
                <span class="dc-item-color-dot" style="background:' + color + '"></span>\
                <div class="dc-item-body">\
                  <div class="dc-item-title">' + dcEscapeHtml(catName) + ' · ' + s.start + '–' + s.end + ' <span style="color:var(--dc-text-muted);font-weight:500">· ' + filled + '/' + slots + '</span></div>\
                  <div class="dc-item-sub">' + dcEscapeHtml(s.description || 'Keine Beschreibung') + '</div>\
                </div>\
                <div class="dc-item-actions">\
                  <button class="dc-item-btn" onclick="dcOpenShadowModal(\'' + s.id + '\')" title="Bearbeiten">\
                    <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>\
                  </button>\
                  <button class="dc-item-btn dc-danger" onclick="dcDeleteShadow(\'' + s.id + '\')" title="Löschen">\
                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>\
                  </button>\
                </div>\
              </div>';
            }).join('')) + '\
      </div>\
    </section>\
    <div class="dc-reset-section">\
      <div class="dc-reset-header">\
        <span class="dc-reset-title">Datenverwaltung</span>\
        <button class="dc-btn-danger-outline" id="dc-reset-btn" onclick="dcResetEntries()">\
          Einträge zurücksetzen\
        </button>\
      </div>\
      <p style="font-size:12px;color:var(--dc-text-faint);margin-top:4px">Löscht alle Benutzer-Einträge und Teilnehmer der Template-Slots. Die Template-Event-Struktur und Konfiguration bleiben erhalten.</p>\
    </div>';

  ['dc-day-name', 'dc-day-date', 'dc-range-start', 'dc-range-end'].forEach(function(id) {
    dcEl(id).oninput = function() {
      if (id === 'dc-day-name') dcState.config.day.name = dcEl(id).value;
      else if (id === 'dc-day-date') dcState.config.day.date = dcEl(id).value;
      else if (id === 'dc-range-start') dcState.config.timeRange.start = dcEl(id).value;
      else if (id === 'dc-range-end') dcState.config.timeRange.end = dcEl(id).value;
      dcRenderSaveBar();
    };
  });

  dcRenderSaveBar();
}

function dcRenderSaveBar() {
  var dirty = dcIsDirty();
  dcEl('dc-save-bar').style.display = dirty ? 'flex' : 'none';
  dcEl('dc-save-label').innerHTML = dirty
    ? '<span class="dc-dirty-indicator"></span>Speichern'
    : 'Speichern';
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet helpers
// ─────────────────────────────────────────────────────────────────────────────

function dcOpenSheet(content) {
  dcEl('dc-sheet-content').innerHTML = content;
  dcEl('dc-backdrop').classList.add('open');
  dcEl('dc-sheet').classList.add('open');
}

function dcCloseSheet() {
  dcEl('dc-backdrop').classList.remove('open');
  dcEl('dc-sheet').classList.remove('open');
  dcState.sheetData = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category modal
// ─────────────────────────────────────────────────────────────────────────────

function dcOpenCategoryModal(id) {
  var existing = id ? dcState.config.categories.find(function(c) { return c.id === id; }) : null;
  dcState.sheetData = {
    type: 'category',
    id: id || null,
    name: existing ? existing.name : '',
    color: existing ? existing.color : DC_COLOR_PALETTE[Math.floor(Math.random() * DC_COLOR_PALETTE.length)]
  };
  dcRenderCategorySheet();
}

function dcRenderCategorySheet() {
  var d = dcState.sheetData;
  var swatches = DC_COLOR_PALETTE.map(function(c) {
    return '<div class="dc-color-swatch" data-selected="' + (c === d.color) + '" style="background:' + c + '" onclick="dcPickColor(\'' + c + '\')"></div>';
  }).join('');
  dcOpenSheet('\
    <div class="dc-sheet-header">\
      <div class="dc-sheet-subtitle">Kategorie</div>\
      <div class="dc-sheet-title">' + (d.id ? 'Bearbeiten' : 'Neue Kategorie') + '</div>\
    </div>\
    <div class="dc-field">\
      <label class="dc-field-label">Name</label>\
      <input class="dc-input" id="dc-cat-name" value="' + dcEscapeHtml(d.name) + '" placeholder="z.B. Geschirrdienst" autofocus>\
    </div>\
    <div class="dc-field">\
      <label class="dc-field-label">Farbe</label>\
      <div class="dc-color-grid">' + swatches + '</div>\
    </div>\
    <div class="dc-actions">\
      <button class="dc-btn dc-btn-secondary" onclick="dcCloseSheet()">Abbrechen</button>\
      <button class="dc-btn dc-btn-primary" onclick="dcSaveCategory()">Übernehmen</button>\
    </div>');
}

function dcPickColor(color) {
  dcState.sheetData.color = color;
  dcState.sheetData.name = dcEl('dc-cat-name') ? dcEl('dc-cat-name').value : dcState.sheetData.name;
  dcRenderCategorySheet();
  setTimeout(function() { if (dcEl('dc-cat-name')) dcEl('dc-cat-name').focus(); }, 0);
}

function dcSaveCategory() {
  var name = dcEl('dc-cat-name').value.trim();
  if (!name) { dcShowToast('Name fehlt', true); return; }
  var d = dcState.sheetData;
  if (d.id) {
    var cat = dcState.config.categories.find(function(c) { return c.id === d.id; });
    cat.name = name;
    cat.color = d.color;
  } else {
    dcState.config.categories.push({ id: dcGenId('cat'), name: name, color: d.color });
  }
  dcCloseSheet();
  dcRender();
}

function dcDeleteCategory(id) {
  var used = dcState.config.events.some(function(e) { return e.categoryId === id; });
  if (used) {
    if (!confirm('Diese Kategorie wird von Events benutzt. Trotzdem löschen? (Events bleiben, verlieren aber Farbe)')) return;
  }
  dcState.config.categories = dcState.config.categories.filter(function(c) { return c.id !== id; });
  dcRender();
}

// ─────────────────────────────────────────────────────────────────────────────
// Shadow modal
// ─────────────────────────────────────────────────────────────────────────────

function dcOpenShadowModal(id) {
  var existing = id ? dcState.config.events.find(function(e) { return e.id === id; }) : null;
  dcState.sheetData = {
    type: 'shadow',
    id: id || null,
    categoryId: existing ? existing.categoryId : (dcState.config.categories[0] ? dcState.config.categories[0].id : null),
    start: existing ? existing.start : dcState.config.timeRange.start,
    end: existing ? existing.end : dcState.config.timeRange.start,
    description: existing ? existing.description : '',
    slots: existing ? (existing.slots != null ? existing.slots : 1) : 1
  };
  dcRenderShadowSheet();
}

function dcRenderShadowSheet() {
  var d = dcState.sheetData;
  var cats = dcState.config.categories;
  if (cats.length === 0) {
    dcOpenSheet('\
      <div class="dc-sheet-header">\
        <div class="dc-sheet-subtitle">Template-Event</div>\
        <div class="dc-sheet-title">Erstmal Kategorie anlegen</div>\
      </div>\
      <p style="color:var(--dc-text-muted);font-size:14px">Du brauchst mindestens eine Kategorie, bevor du Template-Events erstellen kannst.</p>\
      <div class="dc-actions">\
        <button class="dc-btn dc-btn-secondary" onclick="dcCloseSheet()">OK</button>\
      </div>');
    return;
  }
  var catOptions = cats.map(function(c) {
    return '<option value="' + c.id + '"' + (c.id === d.categoryId ? ' selected' : '') + '>' + dcEscapeHtml(c.name) + '</option>';
  }).join('');
  dcOpenSheet('\
    <div class="dc-sheet-header">\
      <div class="dc-sheet-subtitle">Template-Event</div>\
      <div class="dc-sheet-title">' + (d.id ? 'Bearbeiten' : 'Neuer Slot') + '</div>\
    </div>\
    <div class="dc-field">\
      <label class="dc-field-label">Kategorie</label>\
      <select class="dc-input" id="dc-sh-cat">' + catOptions + '</select>\
    </div>\
    <div class="dc-field-row">\
      <div class="dc-field">\
        <label class="dc-field-label">Von</label>\
        <input class="dc-input" type="time" id="dc-sh-start" value="' + d.start + '">\
      </div>\
      <div class="dc-field">\
        <label class="dc-field-label">Bis</label>\
        <input class="dc-input" type="time" id="dc-sh-end" value="' + d.end + '">\
      </div>\
      <div class="dc-field" style="flex:0 0 90px">\
        <label class="dc-field-label">Slots</label>\
        <input class="dc-input" type="number" min="1" max="50" id="dc-sh-slots" value="' + d.slots + '" style="text-align:center;font-variant-numeric:tabular-nums">\
      </div>\
    </div>\
    <div class="dc-field">\
      <label class="dc-field-label">Beschreibung <span style="color:var(--dc-text-faint);font-weight:400;text-transform:none;letter-spacing:0">optional</span></label>\
      <textarea class="dc-input" id="dc-sh-desc" placeholder="z.B. Nach Hauptgang">' + dcEscapeHtml(d.description) + '</textarea>\
    </div>\
    <div class="dc-actions">\
      <button class="dc-btn dc-btn-secondary" onclick="dcCloseSheet()">Abbrechen</button>\
      <button class="dc-btn dc-btn-primary" onclick="dcSaveShadow()">Übernehmen</button>\
    </div>');
}

function dcSaveShadow() {
  var categoryId = dcEl('dc-sh-cat').value;
  var start = dcEl('dc-sh-start').value;
  var end = dcEl('dc-sh-end').value;
  var description = dcEl('dc-sh-desc').value.trim();
  var slots = Math.max(1, parseInt(dcEl('dc-sh-slots').value, 10) || 1);
  if (!start || !end) { dcShowToast('Zeit fehlt', true); return; }
  var parseT = function(t) { var parts = t.split(':').map(Number); return parts[0]*60+parts[1]; };
  if (parseT(end) <= parseT(start)) { dcShowToast('Ende muss nach Start liegen', true); return; }

  var d = dcState.sheetData;
  if (d.id) {
    var ev = dcState.config.events.find(function(e) { return e.id === d.id; });
    Object.assign(ev, { categoryId: categoryId, start: start, end: end, description: description, slots: slots });
    if (!ev.assignments) ev.assignments = [];
    if (ev.assignments.length > slots) {
      if (!confirm('Neue Slot-Zahl (' + slots + ') ist kleiner als bisherige Anmeldungen (' + ev.assignments.length + '). Letzte Einträge werden entfernt.')) return;
      ev.assignments = ev.assignments.slice(0, slots);
    }
  } else {
    dcState.config.events.push({
      id: dcGenId('shadow'),
      categoryId: categoryId, start: start, end: end, description: description, slots: slots,
      assignments: [],
      isShadow: true
    });
  }
  dcCloseSheet();
  dcRender();
}

function dcDeleteShadow(id) {
  if (!confirm('Template-Slot löschen?')) return;
  dcState.config.events = dcState.config.events.filter(function(e) { return e.id !== id; });
  dcRender();
}

// ─────────────────────────────────────────────────────────────────────────────
// Save
// ─────────────────────────────────────────────────────────────────────────────

async function dcSaveAll() {
  var cfg = dcState.config;
  var parseT = function(t) { var parts = t.split(':').map(Number); return parts[0]*60+parts[1]; };
  if (!cfg.day.name) { dcShowToast('Bezeichnung fehlt', true); return; }
  if (!cfg.timeRange.start || !cfg.timeRange.end) { dcShowToast('Zeitraum fehlt', true); return; }
  if (parseT(cfg.timeRange.end) <= parseT(cfg.timeRange.start)) { dcShowToast('Zeitraum ungültig', true); return; }

  var payload = {
    day: cfg.day,
    timeRange: cfg.timeRange,
    categories: cfg.categories,
    shadowEvents: cfg.events.filter(function(e) { return e.isShadow; }).map(function(e) {
      return { id: e.id, categoryId: e.categoryId, start: e.start, end: e.end, description: e.description, slots: e.slots != null ? e.slots : 1 };
    })
  };

  if (DC_USE_DEMO_DATA) {
    dcState.original = JSON.parse(JSON.stringify(dcState.config));
    dcRenderSaveBar();
    dcShowToast('Gespeichert (Demo)');
    return;
  }

  try {
    dcEl('dc-save-btn').disabled = true;
    var res = await fetch(DC_API_BASE_PUT + '/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    dcState.original = JSON.parse(JSON.stringify(dcState.config));
    dcRenderSaveBar();
    dcShowToast('Gespeichert');
  } catch (e) {
    dcShowToast('Fehler: ' + e.message, true);
  } finally {
    dcEl('dc-save-btn').disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────

function dcShowToast(msg, isError) {
  var t = dcEl('dc-toast');
  t.textContent = msg;
  t.classList.toggle('error', !!isError);
  t.classList.add('show');
  clearTimeout(dcShowToast._t);
  dcShowToast._t = setTimeout(function() { t.classList.remove('show'); }, 2200);
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && dcEl('dc-sheet') && dcEl('dc-sheet').classList.contains('open')) {
    dcCloseSheet();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Reset
// ─────────────────────────────────────────────────────────────────────────────

async function dcResetEntries() {
  var confirmed = confirm(
    'Wirklich alle Einträge zurücksetzen?\n\n' +
    '• Alle Benutzer-Einträge (Free-Signups) werden gelöscht.\n' +
    '• Alle Teilnehmer der Template-Slots werden entfernt.\n\n' +
    'Konfiguration, Kategorien und Template-Event-Struktur bleiben erhalten.\n\n' +
    'Diese Aktion kann nicht rückgängig gemacht werden.'
  );
  if (!confirmed) return;

  var btn = dcEl('dc-reset-btn');
  if (btn) btn.disabled = true;

  try {
    var res = await fetch(DC_API_BASE_PUT + '/reset', { method: 'POST' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    dcShowToast('Zurückgesetzt (' + (data.deleted_events || 0) + ' Einträge, ' + (data.deleted_assignments || 0) + ' Teilnehmer gelöscht)');
    await dcLoadConfig();
  } catch (e) {
    dcShowToast('Fehler beim Zurücksetzen: ' + e.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}
