(() => {
  'use strict';

  /* ============ Config ============ */
  const STORAGE_KEY = 'quantic-grade-calculator:subjects';
  const EXPORT_APP_ID = 'quantic-grade-calculator';
  const EXPORT_VERSION = 1;

  // Order here drives the order of the breakdown cards and the formula.
  const TYPES = {
    smartCase: { label: 'Smart Case', plural: 'Smart Cases', weight: 10 },
    project:   { label: 'Project',    plural: 'Projects',    weight: 30 },
    exam:      { label: 'Exam',       plural: 'Exams',       weight: 60 },
  };
  const TYPE_KEYS = Object.keys(TYPES);

  /* ============ DOM ============ */
  const $ = (sel) => document.querySelector(sel);
  const els = {
    finalCard: $('#finalCard'),
    breakdown: $('#breakdown'),
    tableBody: $('#tableBody'),
    emptyState: $('#emptyState'),
    pagination: $('#pagination'),
    resultInfo: $('#resultInfo'),
    search: $('#searchInput'),
    typeFilter: $('#typeFilter'),
    statusFilter: $('#statusFilter'),
    pageSize: $('#pageSizeSelect'),
    thead: document.querySelector('.subjects-table thead'),
    addBtn: $('#addBtn'),
    importBtn: $('#importBtn'),
    exportBtn: $('#exportBtn'),
    clearAllBtn: $('#clearAllBtn'),
    fileInput: $('#fileInput'),
    toast: $('#toast'),

    dialog: $('#subjectDialog'),
    form: $('#subjectForm'),
    dialogTitle: $('#subjectDialogTitle'),
    fields: $('#subjectFields'),
    fTitle: $('#fTitle'),
    fType: $('#fType'),
    fDegree: $('#fDegree'),
    fGraded: $('#fGraded'),
    titleError: $('#titleError'),
    degreeError: $('#degreeError'),
    meta: $('#subjectMeta'),
    metaCreated: $('#metaCreated'),
    metaUpdated: $('#metaUpdated'),
    saveBtn: $('#saveBtn'),
    cancelBtn: $('#cancelBtn'),
    switchEditBtn: $('#switchEditBtn'),

    choiceDialog: $('#choiceDialog'),
    choiceTitle: $('#choiceTitle'),
    choiceMessage: $('#choiceMessage'),
    choiceButtons: $('#choiceButtons'),
  };

  /* ============ State ============ */
  let subjects = loadSubjects();
  const ui = {
    query: '',
    type: 'all',
    status: 'all',
    page: 1,
    pageSize: 10,
    sortKey: 'createdAt',
    sortDir: 'desc',
  };
  let dialogState = { mode: 'add', id: null };

  /* ============ Utils ============ */
  function uid() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  const numberFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const fmt = (n) => numberFmt.format(Math.round(n * 100) / 100);

  const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '—' : dateFmt.format(d);
  };

  let toastTimer;
  function toast(message, isError = false) {
    els.toast.textContent = message;
    els.toast.classList.toggle('error', isError);
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3200);
  }

  /* ============ Storage ============ */
  function loadSubjects() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(sanitizeSubject).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function saveSubjects() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(subjects));
    } catch {
      toast('Could not save to this browser’s storage. Export a backup to avoid losing data.', true);
    }
  }

  /* ============ Validation / normalisation ============ */
  function normalizeType(value) {
    if (typeof value !== 'string') return null;
    const v = value.toLowerCase().replace(/[\s_-]+/g, '');
    if (v === 'smartcase' || v === 'smartcases' || v === 'case' || v === 'sc') return 'smartCase';
    if (v === 'project' || v === 'projects') return 'project';
    if (v === 'exam' || v === 'exams') return 'exam';
    return null;
  }

  function normalizeBool(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 1 || value === '1') return true;
    if (value === 'false' || value === 0 || value === '0') return false;
    return fallback;
  }

  function validIso(value, fallback) {
    if (value == null || value === '') return fallback;
    const d = new Date(value);
    return isNaN(d) ? fallback : d.toISOString();
  }

  /** Returns a clean subject object or null if the input is unusable. */
  function sanitizeSubject(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 120) : '';
    const degree = typeof raw.degree === 'string' ? parseFloat(raw.degree) : raw.degree;
    const type = normalizeType(raw.type);
    if (!title || !type || typeof degree !== 'number' || !isFinite(degree) || degree < 0 || degree > 100) {
      return null;
    }
    const now = new Date().toISOString();
    const createdAt = validIso(raw.createdAt, now);
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      title,
      degree,
      type,
      isGraded: normalizeBool(raw.isGraded, true),
      createdAt,
      updatedAt: validIso(raw.updatedAt, createdAt),
    };
  }

  /* ============ Calculation ============ */
  function computeSummary(list) {
    const categories = {};
    let finalGrade = 0;
    let coveredWeight = 0;

    for (const key of TYPE_KEYS) {
      const { weight } = TYPES[key];
      const all = list.filter((s) => s.type === key);
      const graded = all.filter((s) => s.isGraded);
      const average = graded.length
        ? graded.reduce((sum, s) => sum + s.degree, 0) / graded.length
        : null;
      const contribution = average === null ? null : (average * weight) / 100;

      if (contribution !== null) {
        finalGrade += contribution;
        coveredWeight += weight;
      }
      categories[key] = { weight, total: all.length, graded: graded.length, average, contribution };
    }

    return {
      categories,
      finalGrade,
      coveredWeight,
      // Grade if only the categories that have graded entries are considered.
      projected: coveredWeight ? (finalGrade / coveredWeight) * 100 : null,
    };
  }

  /* ============ Rendering: summary ============ */
  function renderSummary() {
    const { categories, finalGrade, coveredWeight, projected } = computeSummary(subjects);

    // Category cards
    els.breakdown.innerHTML = TYPE_KEYS.map((key) => {
      const t = TYPES[key];
      const c = categories[key];
      const hasData = c.average !== null;
      return `
        <article class="cat-card" data-type="${key}">
          <div class="cat-card-head">
            <span class="dot" aria-hidden="true"></span>
            <h3>${t.plural}</h3>
            <span class="chip">${t.weight}% weight</span>
          </div>
          <dl class="stats">
            <div><dt>Counted entries</dt><dd>${c.graded} <small>of ${c.total}</small></dd></div>
            <div><dt>Average</dt><dd>${hasData ? fmt(c.average) + '%' : '—'}</dd></div>
            <div class="big"><dt>Mapped to final</dt><dd>${hasData ? fmt(c.contribution) : '—'}<small> / ${t.weight}</small></dd></div>
          </dl>
          <div class="meter" role="progressbar" aria-label="${t.plural} average" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${hasData ? fmt(c.average) : 0}">
            <span style="width:${hasData ? c.average : 0}%"></span>
          </div>
          <p class="calc">${hasData
            ? `${fmt(c.average)}% × ${t.weight}% = ${fmt(c.contribution)}%`
            : `No counted ${t.plural.toLowerCase()} yet`}</p>
        </article>`;
    }).join('');

    // Final card
    const segments = TYPE_KEYS.map((key) => {
      const c = categories[key];
      return `<span data-type="${key}" style="width:${c.contribution || 0}%;background:var(--c)" title="${TYPES[key].plural}: ${c.contribution === null ? 0 : fmt(c.contribution)}%"></span>`;
    }).join('');

    const formula = TYPE_KEYS
      .map((key) => (categories[key].contribution === null ? '0' : fmt(categories[key].contribution)))
      .join(' + ') + ` = <strong>${fmt(finalGrade)}%</strong>`;

    const missing = TYPE_KEYS.filter((k) => categories[k].average === null);
    let note = '';
    if (!subjects.length) {
      note = 'Add your Smart Cases, Projects and Exams to see your grade.';
    } else if (missing.length && coveredWeight) {
      note = `No counted ${missing.map((k) => `${TYPES[k].plural} (${TYPES[k].weight}%)`).join(', ')} yet — they count as 0 for now.
        Based only on what you've entered, you're at <strong>${fmt(projected)}%</strong>.`;
    } else if (!coveredWeight) {
      note = 'Nothing is marked as counted yet.';
    } else {
      note = 'All three categories are included.';
    }

    els.finalCard.innerHTML = `
      <p class="eyebrow">Final grade</p>
      <p class="final-value">${fmt(finalGrade)}<span>%</span></p>
      <div class="stack" aria-hidden="true">${segments}</div>
      <ul class="legend">
        ${TYPE_KEYS.map((k) => `<li data-type="${k}"><span class="dot"></span>${TYPES[k].plural}</li>`).join('')}
      </ul>
      <p class="formula">${formula}</p>
      <p class="note">${note}</p>`;
  }

  /* ============ Rendering: table ============ */
  function getFiltered() {
    const q = ui.query.trim().toLowerCase();
    return subjects.filter((s) => {
      if (ui.type !== 'all' && s.type !== ui.type) return false;
      if (ui.status === 'graded' && !s.isGraded) return false;
      if (ui.status === 'excluded' && s.isGraded) return false;
      if (q) {
        const haystack = `${s.title} ${TYPES[s.type].label} ${TYPES[s.type].plural}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  function sortList(list) {
    const dir = ui.sortDir === 'asc' ? 1 : -1;
    const key = ui.sortKey;
    return [...list].sort((a, b) => {
      let r;
      switch (key) {
        case 'title': r = a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }); break;
        case 'type': r = TYPE_KEYS.indexOf(a.type) - TYPE_KEYS.indexOf(b.type); break;
        case 'degree': r = a.degree - b.degree; break;
        case 'isGraded': r = Number(a.isGraded) - Number(b.isGraded); break;
        default: r = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
      }
      // Stable tie-breaker: newest first
      return r * dir || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
  }

  function hasActiveFilters() {
    return ui.query.trim() !== '' || ui.type !== 'all' || ui.status !== 'all';
  }

  function renderTable() {
    const filtered = sortList(getFiltered());
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / ui.pageSize));
    ui.page = Math.min(Math.max(1, ui.page), pages);
    const start = (ui.page - 1) * ui.pageSize;
    const pageItems = filtered.slice(start, start + ui.pageSize);

    // Sort indicators
    els.thead.querySelectorAll('th[data-sort]').forEach((th) => {
      if (th.dataset.sort === ui.sortKey) th.setAttribute('aria-sort', ui.sortDir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });

    // Rows
    els.tableBody.innerHTML = pageItems.map((s) => {
      const t = TYPES[s.type];
      const title = escapeHtml(s.title);
      const id = escapeHtml(s.id);
      return `
        <tr class="${s.isGraded ? '' : 'is-excluded'}">
          <td class="title-cell" data-label="Title">
            <button type="button" class="title-btn" data-action="view" data-id="${id}">${title}</button>
          </td>
          <td data-label="Type"><span class="badge" data-type="${s.type}">${t.label}</span></td>
          <td data-label="Degree" class="num">${fmt(s.degree)}%</td>
          <td data-label="Counted" class="toggle-cell">
            <label class="switch">
              <input type="checkbox" data-action="toggle" data-id="${id}" ${s.isGraded ? 'checked' : ''}>
              <span class="track" aria-hidden="true"></span>
              <span class="sr-only">Count “${title}” toward final grade</span>
            </label>
          </td>
          <td data-label="Created"><span class="date">${fmtDate(s.createdAt)}</span></td>
          <td class="actions">
            <div class="actions-inner">
              <button type="button" class="icon-btn" data-action="view" data-id="${id}" title="View" aria-label="View ${title}">
                <svg class="icon"><use href="#i-eye"/></svg>
              </button>
              <button type="button" class="icon-btn" data-action="edit" data-id="${id}" title="Edit" aria-label="Edit ${title}">
                <svg class="icon"><use href="#i-edit"/></svg>
              </button>
              <button type="button" class="icon-btn danger" data-action="delete" data-id="${id}" title="Delete" aria-label="Delete ${title}">
                <svg class="icon"><use href="#i-trash"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');

    // Empty state
    const isEmpty = total === 0;
    els.emptyState.hidden = !isEmpty;
    els.tableBody.parentElement.hidden = isEmpty;
    if (isEmpty) {
      els.emptyState.innerHTML = subjects.length
        ? `<svg class="icon"><use href="#i-search"/></svg>
           <strong>No matching subjects</strong>
           <span>Try a different search or clear the filters.</span>
           <button type="button" class="btn btn-ghost" data-action="clear-filters">Clear filters</button>`
        : `<svg class="icon"><use href="#i-book"/></svg>
           <strong>No subjects yet</strong>
           <span>Add your first Smart Case, Project or Exam, or import a JSON backup.</span>
           <button type="button" class="btn btn-primary" data-action="add"><svg class="icon"><use href="#i-plus"/></svg>Add subject</button>`;
    }

    // Info line
    if (!subjects.length) {
      els.resultInfo.textContent = '0 subjects';
    } else if (isEmpty) {
      els.resultInfo.textContent = `0 of ${subjects.length} subjects match`;
    } else {
      const range = `${start + 1}–${start + pageItems.length}`;
      els.resultInfo.textContent = hasActiveFilters()
        ? `Showing ${range} of ${total} matching (${subjects.length} total)`
        : `Showing ${range} of ${total} subjects`;
    }
    els.clearAllBtn.hidden = subjects.length === 0;

    renderPagination(pages);
  }

  function pageList(current, total) {
    const wanted = new Set([1, total, current - 1, current, current + 1]);
    const sorted = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
    const out = [];
    let prev = 0;
    for (const p of sorted) {
      if (p - prev === 2) out.push(prev + 1);
      else if (p - prev > 2) out.push('gap');
      out.push(p);
      prev = p;
    }
    return out;
  }

  function renderPagination(pages) {
    if (pages <= 1) {
      els.pagination.innerHTML = '';
      return;
    }
    const items = pageList(ui.page, pages).map((p) => (p === 'gap'
      ? '<span class="page-gap" aria-hidden="true">…</span>'
      : `<button type="button" class="page-btn" data-page="${p}" ${p === ui.page ? 'aria-current="page"' : ''} aria-label="Page ${p}">${p}</button>`
    )).join('');

    els.pagination.innerHTML = `
      <button type="button" class="page-btn" data-page="${ui.page - 1}" ${ui.page === 1 ? 'disabled' : ''} aria-label="Previous page">
        <svg class="icon"><use href="#i-left"/></svg>
      </button>
      ${items}
      <button type="button" class="page-btn" data-page="${ui.page + 1}" ${ui.page === pages ? 'disabled' : ''} aria-label="Next page">
        <svg class="icon"><use href="#i-right"/></svg>
      </button>`;
  }

  function render() {
    renderSummary();
    renderTable();
  }

  /* ============ Choice / confirm dialog ============ */
  /**
   * Shows a modal with custom buttons; resolves with the clicked button's value
   * (or "cancel" if dismissed with Esc).
   */
  function choose({ title, message, buttons }) {
    return new Promise((resolve) => {
      els.choiceTitle.textContent = title;
      els.choiceMessage.textContent = message;
      els.choiceButtons.innerHTML = buttons
        .map((b) => `<button type="submit" value="${b.value}" class="btn ${b.className || 'btn-ghost'}">${escapeHtml(b.label)}</button>`)
        .join('');
      els.choiceDialog.returnValue = 'cancel';
      els.choiceDialog.addEventListener('close', () => resolve(els.choiceDialog.returnValue || 'cancel'), { once: true });
      els.choiceDialog.showModal();
      const primary = els.choiceButtons.querySelector('.btn-ghost');
      if (primary) primary.focus();
    });
  }

  async function confirmAction({ title, message, confirmLabel = 'Delete' }) {
    const result = await choose({
      title,
      message,
      buttons: [
        { value: 'cancel', label: 'Cancel' },
        { value: 'confirm', label: confirmLabel, className: 'btn-danger' },
      ],
    });
    return result === 'confirm';
  }

  /* ============ Unique names ============ */
  // "  Accounting   EXAM " and "accounting exam" are treated as the same name.
  const normalizeTitle = (t) => String(t).trim().replace(/\s+/g, ' ').toLocaleLowerCase();

  function findDuplicate(title, excludeId = null, list = subjects) {
    const key = normalizeTitle(title);
    if (!key) return null;
    return list.find((s) => s.id !== excludeId && normalizeTitle(s.title) === key) || null;
  }

  const ROMAN = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  function toRoman(n) {
    let out = '';
    for (const [value, symbol] of ROMAN) {
      while (n >= value) { out += symbol; n -= value; }
    }
    return out;
  }
  function fromRoman(str) {
    for (let n = 1; n <= 39; n++) if (toRoman(n) === str) return n;
    return 0;
  }

  /** "Exam" -> "Exam II", "Exam II" -> "Exam III" (skipping names already taken). */
  function suggestTitle(title, excludeId) {
    const clean = title.trim().replace(/\s+/g, ' ');
    const match = clean.match(/^(.*\S)\s+([IVX]+)$/);
    let base = clean;
    let n = 1;
    if (match && fromRoman(match[2])) {
      base = match[1];
      n = fromRoman(match[2]);
    }
    for (let i = n + 1; i <= 39; i++) {
      const candidate = `${base} ${toRoman(i)}`;
      if (!findDuplicate(candidate, excludeId)) return candidate;
    }
    return null;
  }

  /** Shows/clears the duplicate-name warning. Returns true if the title is a duplicate. */
  function checkTitleDuplicate() {
    if (dialogState.mode === 'view') return false;
    const field = els.fTitle.closest('.field');
    const dup = findDuplicate(els.fTitle.value, dialogState.id);
    if (!dup) {
      els.titleError.innerHTML = '';
      field.classList.remove('invalid');
      return false;
    }
    const suggestion = suggestTitle(dup.title, dialogState.id);
    els.titleError.innerHTML = `
      <span class="dup">
        <span><strong>Duplicate name.</strong> A subject with this name already exists:</span>
        <span class="dup-card">
          <span class="badge" data-type="${dup.type}">${TYPES[dup.type].label}</span>
          <span class="dup-title">${escapeHtml(dup.title)}</span>
          <span class="dup-degree">${fmt(dup.degree)}%</span>
          <span class="dup-meta">${dup.isGraded ? 'Counted' : 'Not counted'} · added ${fmtDate(dup.createdAt)}</span>
        </span>
        <span>If you're not re-entering the same one, give it a distinct name${suggestion
          ? `, e.g. <button type="button" class="link-btn" data-suggest="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>`
          : ''}.</span>
      </span>`;
    field.classList.add('invalid');
    return true;
  }

  /* ============ Subject dialog ============ */
  function clearErrors() {
    els.titleError.textContent = '';
    els.degreeError.textContent = '';
    els.fTitle.closest('.field').classList.remove('invalid');
    els.fDegree.closest('.field').classList.remove('invalid');
  }

  function setDialogMode(mode) {
    dialogState.mode = mode;
    const isView = mode === 'view';
    els.dialogTitle.textContent = mode === 'add' ? 'Add subject' : isView ? 'Subject details' : 'Edit subject';
    els.fields.disabled = isView;
    els.saveBtn.hidden = isView;
    els.switchEditBtn.hidden = !isView;
    els.cancelBtn.textContent = isView ? 'Close' : 'Cancel';
    els.saveBtn.textContent = mode === 'add' ? 'Add subject' : 'Save changes';
    clearErrors();
  }

  function openSubjectDialog(mode, subject = null) {
    els.form.reset();
    dialogState = { mode, id: subject ? subject.id : null };

    if (subject) {
      els.fTitle.value = subject.title;
      els.fType.value = subject.type;
      els.fDegree.value = subject.degree;
      els.fGraded.checked = subject.isGraded;
      els.metaCreated.textContent = fmtDate(subject.createdAt);
      els.metaUpdated.textContent = fmtDate(subject.updatedAt);
      els.meta.hidden = false;
    } else {
      els.fType.value = ui.type !== 'all' ? ui.type : 'smartCase';
      els.fGraded.checked = true;
      els.meta.hidden = true;
    }

    setDialogMode(mode);
    if (mode === 'edit') checkTitleDuplicate();
    els.dialog.showModal();
    if (mode === 'view') els.cancelBtn.focus();
    else els.fTitle.focus();
  }

  function readForm() {
    clearErrors();
    const title = els.fTitle.value.trim();
    const degreeRaw = els.fDegree.value.trim();
    const degree = Number(degreeRaw);
    let ok = true;

    if (!title) {
      els.titleError.textContent = 'Please enter a title.';
      els.fTitle.closest('.field').classList.add('invalid');
      ok = false;
    } else if (checkTitleDuplicate()) {
      ok = false;
    }
    if (degreeRaw === '' || !isFinite(degree) || degree < 0 || degree > 100) {
      els.degreeError.textContent = 'Enter a percentage between 0 and 100.';
      els.fDegree.closest('.field').classList.add('invalid');
      ok = false;
    }
    if (!ok) {
      els.form.querySelector('.field.invalid input').focus();
      return null;
    }
    return { title, degree, type: els.fType.value, isGraded: els.fGraded.checked };
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (dialogState.mode === 'view') return;
    const data = readForm();
    if (!data) return;
    const now = new Date().toISOString();

    if (dialogState.mode === 'add') {
      subjects.push({ id: uid(), ...data, createdAt: now, updatedAt: now });
      // Show the new item: newest first on page 1 when using the default sort.
      if (ui.sortKey === 'createdAt' && ui.sortDir === 'desc') ui.page = 1;
      toast(`Added “${data.title}”`);
    } else {
      const idx = subjects.findIndex((s) => s.id === dialogState.id);
      if (idx === -1) {
        toast('That subject no longer exists.', true);
      } else {
        subjects[idx] = { ...subjects[idx], ...data, updatedAt: now };
        toast(`Updated “${data.title}”`);
      }
    }

    saveSubjects();
    render();
    els.dialog.close();
  }

  /* ============ Actions ============ */
  const findSubject = (id) => subjects.find((s) => s.id === id);

  async function deleteSubject(id) {
    const s = findSubject(id);
    if (!s) return;
    const ok = await confirmAction({
      title: 'Delete subject?',
      message: `“${s.title}” will be permanently removed.`,
    });
    if (!ok) return;
    subjects = subjects.filter((x) => x.id !== id);
    saveSubjects();
    render();
    toast(`Deleted “${s.title}”`);
  }

  function toggleGraded(id, checked) {
    const s = findSubject(id);
    if (!s) return;
    s.isGraded = checked;
    s.updatedAt = new Date().toISOString();
    saveSubjects();
    render();
  }

  function clearFilters() {
    ui.query = '';
    ui.type = 'all';
    ui.status = 'all';
    ui.page = 1;
    els.search.value = '';
    els.typeFilter.value = 'all';
    els.statusFilter.value = 'all';
    renderTable();
  }

  async function clearAll() {
    const ok = await confirmAction({
      title: 'Clear all subjects?',
      message: `All ${subjects.length} subjects will be permanently removed from this browser.\nConsider exporting a backup first.`,
      confirmLabel: 'Clear all',
    });
    if (!ok) return;
    subjects = [];
    saveSubjects();
    ui.page = 1;
    render();
    toast('All subjects cleared');
  }

  /* ============ Import / export ============ */
  function exportData() {
    const payload = {
      app: EXPORT_APP_ID,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      weights: Object.fromEntries(TYPE_KEYS.map((k) => [k, TYPES[k].weight])),
      subjects,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quantic-grades-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${subjects.length} subject${subjects.length === 1 ? '' : 's'}`);
  }

  async function importFile(file) {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast('That file is not valid JSON.', true);
      return;
    }

    const rawList = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.subjects) ? parsed.subjects : null;
    if (!rawList) {
      toast('No subjects found in that file.', true);
      return;
    }

    const incoming = rawList.map(sanitizeSubject).filter(Boolean);
    const skipped = rawList.length - incoming.length;
    if (!incoming.length) {
      toast(`No valid subjects found${skipped ? ` (${skipped} skipped)` : ''}.`, true);
      return;
    }

    // De-duplicate ids within the file itself (last one wins).
    const byId = new Map(incoming.map((s) => [s.id, s]));
    // Then drop repeated names within the file (first one wins).
    const unique = [];
    for (const s of byId.values()) {
      if (!findDuplicate(s.title, s.id, unique)) unique.push(s);
    }
    const fileDupes = byId.size - unique.length;

    let mode = 'replace';
    if (subjects.length) {
      mode = await choose({
        title: 'Import subjects',
        message: `Found ${unique.length} valid subject${unique.length === 1 ? '' : 's'}${skipped ? ` (${skipped} invalid skipped)` : ''}.\n\n` +
          `Merge: keep your current ${subjects.length} and add/update from the file (names you already have are skipped).\n` +
          'Replace: delete current data and use only the file.',
        buttons: [
          { value: 'cancel', label: 'Cancel' },
          { value: 'replace', label: 'Replace', className: 'btn-danger' },
          { value: 'merge', label: 'Merge', className: 'btn-primary' },
        ],
      });
    }
    if (mode === 'cancel') return;

    if (mode === 'replace') {
      subjects = unique;
      const parts = [];
      if (skipped) parts.push(`${skipped} invalid skipped`);
      if (fileDupes) parts.push(`${fileDupes} duplicate name${fileDupes === 1 ? '' : 's'} skipped`);
      toast(`Imported ${unique.length} subject${unique.length === 1 ? '' : 's'}${parts.length ? ` (${parts.join(', ')})` : ''}`);
    } else {
      let added = 0;
      let updated = 0;
      let dupes = fileDupes;
      const index = new Map(subjects.map((s, i) => [s.id, i]));
      for (const s of unique) {
        if (findDuplicate(s.title, s.id)) {
          dupes++;
        } else if (index.has(s.id)) {
          subjects[index.get(s.id)] = s;
          updated++;
        } else {
          subjects.push(s);
          added++;
        }
      }
      toast(`${added} added, ${updated} updated${dupes ? `, ${dupes} duplicate name${dupes === 1 ? '' : 's'} skipped` : ''}${skipped ? `, ${skipped} invalid skipped` : ''}`);
    }

    ui.page = 1;
    saveSubjects();
    render();
  }

  /* ============ Events ============ */
  els.addBtn.addEventListener('click', () => openSubjectDialog('add'));
  els.exportBtn.addEventListener('click', exportData);
  els.importBtn.addEventListener('click', () => els.fileInput.click());
  els.clearAllBtn.addEventListener('click', clearAll);

  els.fileInput.addEventListener('change', async () => {
    const file = els.fileInput.files && els.fileInput.files[0];
    els.fileInput.value = '';
    if (file) await importFile(file);
  });

  els.search.addEventListener('input', () => {
    ui.query = els.search.value;
    ui.page = 1;
    renderTable();
  });
  els.typeFilter.addEventListener('change', () => {
    ui.type = els.typeFilter.value;
    ui.page = 1;
    renderTable();
  });
  els.statusFilter.addEventListener('change', () => {
    ui.status = els.statusFilter.value;
    ui.page = 1;
    renderTable();
  });
  els.pageSize.addEventListener('change', () => {
    ui.pageSize = Number(els.pageSize.value) || 10;
    ui.page = 1;
    renderTable();
  });

  els.thead.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    if (ui.sortKey === key) {
      ui.sortDir = ui.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      ui.sortKey = key;
      // Sensible first direction: text ascending, numbers/dates descending.
      ui.sortDir = key === 'title' || key === 'type' ? 'asc' : 'desc';
    }
    renderTable();
  });

  els.tableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const s = findSubject(btn.dataset.id);
    if (!s) return;
    if (btn.dataset.action === 'view') openSubjectDialog('view', s);
    else if (btn.dataset.action === 'edit') openSubjectDialog('edit', s);
    else if (btn.dataset.action === 'delete') deleteSubject(s.id);
  });

  els.tableBody.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-action="toggle"]');
    if (input) toggleGraded(input.dataset.id, input.checked);
  });

  els.emptyState.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'add') openSubjectDialog('add');
    else if (btn.dataset.action === 'clear-filters') clearFilters();
  });

  els.pagination.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (!btn || btn.disabled) return;
    ui.page = Number(btn.dataset.page);
    renderTable();
  });

  els.form.addEventListener('submit', handleSubmit);
  els.dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => els.dialog.close()));
  els.fTitle.addEventListener('input', checkTitleDuplicate);
  els.titleError.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-suggest]');
    if (!btn) return;
    els.fTitle.value = btn.dataset.suggest;
    checkTitleDuplicate();
    els.fTitle.focus();
  });

  els.switchEditBtn.addEventListener('click', () => {
    setDialogMode('edit');
    checkTitleDuplicate();
    els.fTitle.focus();
  });

  // Close modals when clicking the backdrop.
  [els.dialog, els.choiceDialog].forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close('cancel');
    });
  });

  // Keep multiple open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      subjects = loadSubjects();
      render();
    }
  });

  render();
})();
