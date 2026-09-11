(() => {
  'use strict';

  const POLL_MS = 20000;
  const COLOR_CYCLE = ['Blue', 'Orange', 'Green', 'Purple', 'Pink', 'Gray'];
  const COLOR_VARS = {
    Blue: 'var(--blue-500)',
    Orange: 'var(--orange-500)',
    Green: 'var(--green-600)',
    Purple: 'var(--purple-500)',
    Pink: 'var(--pink-500)',
    Gray: 'var(--gray-400)',
  };
  const STAT_ACCENTS = ['var(--blue-500)', 'var(--navy-900)', 'var(--orange-500)', 'var(--green-600)'];
  const STATUSES = ['Not Started', 'In Progress', 'Completed'];
  const OWNER_NAMES = ['Maria', 'JuanSe', 'Santi'];

  const els = {
    board: document.getElementById('board'),
    boardEmpty: document.getElementById('boardEmpty'),
    statsRow: document.getElementById('statsRow'),
    syncStatus: document.getElementById('syncStatus'),
    refreshBtn: document.getElementById('refreshBtn'),
    addProjectBtn: document.getElementById('addProjectBtn'),
    toast: document.getElementById('toast'),
    gateOverlay: document.getElementById('gateOverlay'),
    gateInput: document.getElementById('gateInput'),
    gateSubmit: document.getElementById('gateSubmit'),
    gateError: document.getElementById('gateError'),
    tabBoard: document.getElementById('tabBoard'),
    tabTasks: document.getElementById('tabTasks'),
    statsRowEl: document.getElementById('statsRow'),
    myTasksView: document.getElementById('myTasksView'),
    ownerFilter: document.getElementById('ownerFilter'),
    taskList: document.getElementById('taskList'),
  };

  let state = { projects: [], subtasks: [] };
  let pollTimer = null;
  let addingColumn = false;
  let activeTab = 'board';
  let selectedOwners = new Set(OWNER_NAMES);

  // ---------- API ----------

  function boardKey() {
    return localStorage.getItem('board_access_code') || '';
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-board-key': boardKey(),
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      showGate();
      throw new Error('Access code required');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // ---------- Gate ----------

  function showGate() {
    els.gateOverlay.classList.remove('hidden');
  }
  function hideGate() {
    els.gateOverlay.classList.add('hidden');
  }
  els.gateSubmit.addEventListener('click', async () => {
    localStorage.setItem('board_access_code', els.gateInput.value.trim());
    els.gateError.classList.add('hidden');
    try {
      await loadBoard();
      hideGate();
    } catch (e) {
      els.gateError.classList.remove('hidden');
    }
  });
  els.gateInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.gateSubmit.click();
  });

  // ---------- Toast ----------

  let toastTimer = null;
  function toast(message, isError = false) {
    els.toast.textContent = message;
    els.toast.classList.toggle('error', isError);
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
  }

  // ---------- Load & render ----------

  async function loadBoard(showAnimation = false) {
    if (showAnimation) els.refreshBtn.classList.add('anchor-toss');
    try {
      const data = await api('/api/board');
      state.projects = data.projects.sort((a, b) => a.order - b.order);
      state.subtasks = data.subtasks.sort((a, b) => a.order - b.order);
      render();
      els.syncStatus.textContent = 'Synced just now';
    } catch (e) {
      if (e.message !== 'Access code required') {
        els.syncStatus.textContent = 'Sync failed';
        toast(e.message, true);
      }
    } finally {
      setTimeout(() => els.refreshBtn.classList.remove('anchor-toss'), 700);
    }
  }

  function setActiveTab(tab) {
    activeTab = tab;
    els.tabBoard.classList.toggle('tab-active', tab === 'board');
    els.tabTasks.classList.toggle('tab-active', tab === 'tasks');
    els.statsRowEl.hidden = tab !== 'board';
    els.board.hidden = tab !== 'board';
    els.boardEmpty.hidden = tab !== 'board' || state.projects.length > 0;
    els.addProjectBtn.hidden = tab !== 'board';
    els.myTasksView.hidden = tab !== 'tasks';
    render();
  }

  function render() {
    if (activeTab === 'board') {
      renderStats();
      renderColumns();
    } else {
      renderMyTasks();
    }
  }

  function renderStats() {
    const today = new Date().toISOString().slice(0, 10);
    const total = state.subtasks.length;
    const overdue = state.subtasks.filter((s) => s.dueDate && s.dueDate < today && s.status !== 'Completed').length;
    const completed = state.subtasks.filter((s) => s.status === 'Completed').length;
    const stats = [
      { label: 'Projects', value: state.projects.length, caption: 'Active columns' },
      { label: 'Subtasks', value: total, caption: 'Across all projects' },
      { label: 'Overdue', value: overdue, caption: 'Needs attention' },
      { label: 'Completed', value: completed, caption: total ? `${Math.round((completed / total) * 100)}% of all subtasks` : '—' },
    ];
    els.statsRow.innerHTML = '';
    stats.forEach((s, i) => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      card.style.setProperty('--stat-accent', STAT_ACCENTS[i]);
      card.innerHTML = `
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-caption">${s.caption}</div>
      `;
      els.statsRow.appendChild(card);
    });
  }

  // ---------- My Tasks ----------

  function renderMyTasks() {
    renderOwnerFilter();
    renderTaskList();
  }

  function renderOwnerFilter() {
    els.ownerFilter.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'owner-filter-label';
    label.textContent = 'Show tasks for';
    els.ownerFilter.appendChild(label);

    OWNER_NAMES.forEach((name) => {
      const pill = document.createElement('button');
      pill.className = 'owner-pill' + (selectedOwners.has(name) ? ' active' : '');
      pill.textContent = name;
      pill.addEventListener('click', () => {
        if (selectedOwners.has(name)) selectedOwners.delete(name);
        else selectedOwners.add(name);
        renderMyTasks();
      });
      els.ownerFilter.appendChild(pill);
    });
  }

  function renderTaskList() {
    els.taskList.innerHTML = '';

    const matches = state.subtasks.filter((s) => {
      if (selectedOwners.size === 0) return false;
      const owner = (s.owner || '').toLowerCase();
      return [...selectedOwners].some((name) => owner.includes(name.toLowerCase()));
    });

    matches.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'task-list-empty';
      empty.textContent = selectedOwners.size === 0
        ? 'Select one or more names above to see their tasks.'
        : 'No tasks found for the selected people.';
      els.taskList.appendChild(empty);
      return;
    }

    matches.forEach((s) => els.taskList.appendChild(renderTaskRow(s)));
  }

  function renderTaskRow(subtask) {
    const row = document.createElement('div');
    row.className = 'task-row';

    const name = document.createElement('div');
    name.className = 'task-row-name';
    name.textContent = subtask.name || 'Untitled subtask';

    const project = document.createElement('span');
    project.className = 'task-row-project';
    const projectObj = state.projects.find((p) => p.id === subtask.projectId);
    project.textContent = projectObj ? projectObj.name : 'Unassigned project';

    const owner = document.createElement('span');
    owner.className = 'task-row-owner';
    owner.textContent = subtask.owner || 'Unassigned';

    const due = document.createElement('button');
    due.className = 'task-row-due';
    due.textContent = subtask.dueDate ? formatDate(subtask.dueDate) : 'No date';
    if (isOverdue(subtask.dueDate, subtask.status)) due.classList.add('overdue');
    due.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'date';
      input.value = subtask.dueDate || '';
      input.className = 'task-row-due';
      due.replaceWith(input);
      input.focus();
      input.addEventListener('change', () => saveSubtask(subtask.id, { dueDate: input.value || null }));
      input.addEventListener('blur', () => render());
    });

    const status = document.createElement('select');
    status.className = `status-pill status-${subtask.status.toLowerCase().replace(/\s+/g, '-')}`;
    STATUSES.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (s === subtask.status) opt.selected = true;
      status.appendChild(opt);
    });
    status.addEventListener('change', () => {
      status.className = `status-pill status-${status.value.toLowerCase().replace(/\s+/g, '-')}`;
      saveSubtask(subtask.id, { status: status.value });
    });

    row.append(name, project, owner, due, status);
    return row;
  }

  function renderColumns() {
    els.board.innerHTML = '';
    els.boardEmpty.hidden = state.projects.length > 0;

    state.projects.forEach((project) => {
      els.board.appendChild(renderColumn(project));
    });

    els.board.appendChild(renderGhostColumn());
  }

  function formatDate(iso) {
    if (!iso) return null;
    const d = new Date(iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function isOverdue(iso, status) {
    if (!iso || status === 'Completed') return false;
    return iso < new Date().toISOString().slice(0, 10);
  }

  // ---------- Column ----------

  function renderColumn(project) {
    const col = document.createElement('div');
    col.className = 'column';
    col.dataset.projectId = project.id;
    col.style.setProperty('--col-accent', COLOR_VARS[project.color] || 'var(--blue-500)');

    const header = document.createElement('div');
    header.className = 'column-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'column-title-row';

    const title = document.createElement('div');
    title.className = 'column-title';
    title.contentEditable = 'true';
    title.spellcheck = false;
    title.textContent = project.name || 'Untitled project';
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });
    title.addEventListener('blur', () => {
      const value = title.textContent.trim() || 'Untitled project';
      title.textContent = value;
      if (value !== project.name) saveProject(project.id, { name: value });
    });

    const menuBtn = document.createElement('button');
    menuBtn.className = 'column-menu-btn';
    menuBtn.title = 'Delete project';
    menuBtn.textContent = '✕';
    menuBtn.addEventListener('click', () => deleteProject(project));

    titleRow.append(title, menuBtn);

    const meta = document.createElement('div');
    meta.className = 'column-meta';
    meta.appendChild(metaRow('Owner', project.owner, 'text', (val) => saveProject(project.id, { owner: val })));
    meta.appendChild(metaRow('Due', project.dueDate, 'date', (val) => saveProject(project.id, { dueDate: val })));

    header.append(titleRow, meta);

    const list = document.createElement('div');
    list.className = 'subtask-list';
    list.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
    list.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    list.addEventListener('drop', (e) => onDrop(e, project.id, list));

    const subtasks = state.subtasks.filter((s) => s.projectId === project.id);
    if (subtasks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'subtask-empty';
      empty.textContent = 'No subtasks yet';
      list.appendChild(empty);
    } else {
      subtasks.forEach((s) => list.appendChild(renderCard(s)));
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'add-subtask-btn';
    addBtn.textContent = '+ Add subtask';
    addBtn.addEventListener('click', () => createSubtask(project.id));

    col.append(header, list, addBtn);
    return col;
  }

  function metaRow(label, value, type, onSave) {
    const row = document.createElement('div');
    row.className = 'meta-row';
    const lbl = document.createElement('span');
    lbl.className = 'meta-label';
    lbl.textContent = label;

    const val = document.createElement('span');
    val.className = 'meta-value';

    if (type === 'date') {
      val.textContent = value ? formatDate(value) : 'Set date';
      if (!value) val.classList.add('placeholder');
      if (isOverdue(value, null)) val.classList.add('overdue');
      val.tabIndex = 0;
      val.addEventListener('click', () => openDateInput(val, value, onSave));
    } else {
      val.textContent = value || 'Unassigned';
      if (!value) val.classList.add('placeholder');
      val.contentEditable = 'true';
      val.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); val.blur(); } });
      val.addEventListener('focus', () => { if (val.classList.contains('placeholder')) val.textContent = ''; });
      val.addEventListener('blur', () => {
        const text = val.textContent.trim();
        val.textContent = text || 'Unassigned';
        val.classList.toggle('placeholder', !text);
        if (text !== (value || '')) onSave(text);
      });
    }

    row.append(lbl, val);
    return row;
  }

  function openDateInput(anchor, value, onSave) {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = value || '';
    input.className = 'meta-value';
    anchor.replaceWith(input);
    input.focus();
    const commit = () => {
      onSave(input.value || null);
    };
    input.addEventListener('change', commit);
    input.addEventListener('blur', () => render());
  }

  function renderGhostColumn() {
    const col = document.createElement('div');
    col.className = 'column ghost';

    if (!addingColumn) {
      const btn = document.createElement('button');
      btn.className = 'ghost-btn';
      btn.textContent = '+ Add project';
      btn.addEventListener('click', () => { addingColumn = true; render(); });
      col.appendChild(btn);
      return col;
    }

    const form = document.createElement('div');
    form.className = 'new-column-form';
    const input = document.createElement('input');
    input.placeholder = 'Project name';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') { addingColumn = false; render(); }
    });
    const actions = document.createElement('div');
    actions.className = 'new-column-form-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary';
    saveBtn.textContent = 'Add';
    saveBtn.addEventListener('click', submit);
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { addingColumn = false; render(); });

    async function submit() {
      const name = input.value.trim();
      if (!name) return;
      const maxOrder = state.projects.reduce((m, p) => Math.max(m, p.order), 0);
      const color = COLOR_CYCLE[state.projects.length % COLOR_CYCLE.length];
      try {
        const project = await api('/api/projects', {
          method: 'POST',
          body: JSON.stringify({ name, order: maxOrder + 1, color }),
        });
        state.projects.push(project);
        addingColumn = false;
        render();
        toast('Project added');
      } catch (e) {
        toast(e.message, true);
      }
    }

    actions.append(saveBtn, cancelBtn);
    form.append(input, actions);
    col.appendChild(form);
    setTimeout(() => input.focus(), 0);
    return col;
  }

  // ---------- Subtask card ----------

  function renderCard(subtask) {
    const card = document.createElement('div');
    card.className = 'card-item';
    card.draggable = true;
    card.dataset.subtaskId = subtask.id;

    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', subtask.id);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.justifyContent = 'space-between';
    topRow.style.alignItems = 'flex-start';

    const name = document.createElement('div');
    name.className = 'card-item-name';
    name.contentEditable = 'true';
    name.spellcheck = false;
    name.textContent = subtask.name || 'Untitled subtask';
    name.style.flex = '1';
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
    name.addEventListener('blur', () => {
      const value = name.textContent.trim() || 'Untitled subtask';
      name.textContent = value;
      if (value !== subtask.name) saveSubtask(subtask.id, { name: value });
    });

    const del = document.createElement('button');
    del.className = 'card-delete';
    del.textContent = '✕';
    del.title = 'Delete subtask';
    del.addEventListener('click', () => deleteSubtask(subtask));

    topRow.append(name, del);

    const row = document.createElement('div');
    row.className = 'card-item-row';

    const owner = document.createElement('span');
    owner.className = 'card-owner';
    owner.contentEditable = 'true';
    owner.textContent = subtask.owner || 'Unassigned';
    if (!subtask.owner) owner.classList.add('placeholder');
    owner.addEventListener('focus', () => { if (owner.classList.contains('placeholder')) owner.textContent = ''; });
    owner.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); owner.blur(); } });
    owner.addEventListener('blur', () => {
      const value = owner.textContent.trim();
      owner.textContent = value || 'Unassigned';
      owner.classList.toggle('placeholder', !value);
      if (value !== (subtask.owner || '')) saveSubtask(subtask.id, { owner: value });
    });

    const due = document.createElement('button');
    due.className = 'card-due';
    due.textContent = subtask.dueDate ? formatDate(subtask.dueDate) : 'No date';
    if (isOverdue(subtask.dueDate, subtask.status)) due.classList.add('overdue');
    due.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'date';
      input.value = subtask.dueDate || '';
      input.className = 'card-due';
      due.replaceWith(input);
      input.focus();
      input.addEventListener('change', () => saveSubtask(subtask.id, { dueDate: input.value || null }));
      input.addEventListener('blur', () => render());
    });

    row.append(owner, due);

    const status = document.createElement('select');
    status.className = `status-pill status-${subtask.status.toLowerCase().replace(/\s+/g, '-')}`;
    STATUSES.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (s === subtask.status) opt.selected = true;
      status.appendChild(opt);
    });
    status.addEventListener('change', () => {
      status.className = `status-pill status-${status.value.toLowerCase().replace(/\s+/g, '-')}`;
      saveSubtask(subtask.id, { status: status.value });
    });

    card.append(topRow, row, status);
    return card;
  }

  // Figures out where in the target column the card was dropped (based on
  // cursor position relative to the other cards already there) and computes
  // a fractional order value that slots it exactly into that spot — works
  // the same whether it's a reorder within a column or a move to another one.
  function computeInsertionOrder(projectId, excludeId, clientY, listEl) {
    const siblingEls = [...listEl.querySelectorAll('.card-item')].filter(
      (el) => el.dataset.subtaskId !== excludeId
    );
    let insertBeforeId = null;
    for (const el of siblingEls) {
      const rect = el.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        insertBeforeId = el.dataset.subtaskId;
        break;
      }
    }

    const siblings = state.subtasks
      .filter((s) => s.projectId === projectId && s.id !== excludeId)
      .sort((a, b) => a.order - b.order);

    if (siblings.length === 0) return 1;
    if (insertBeforeId === null) return siblings[siblings.length - 1].order + 1;

    const idx = siblings.findIndex((s) => s.id === insertBeforeId);
    if (idx === 0) return siblings[0].order - 1;
    return (siblings[idx - 1].order + siblings[idx].order) / 2;
  }

  function onDrop(e, projectId, listEl) {
    e.preventDefault();
    listEl.closest('.column').classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain');
    const subtask = state.subtasks.find((s) => s.id === id);
    if (!subtask) return;

    const newOrder = computeInsertionOrder(projectId, id, e.clientY, listEl);
    if (subtask.projectId === projectId && subtask.order === newOrder) return;

    subtask.projectId = projectId;
    subtask.order = newOrder;
    render();
    saveSubtask(id, { projectId, order: newOrder });
  }

  // ---------- Mutations ----------

  async function saveProject(id, patch) {
    const project = state.projects.find((p) => p.id === id);
    if (project) Object.assign(project, patch);
    try {
      await api(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function deleteProject(project) {
    if (!confirm(`Delete "${project.name}" and all its subtasks? This can't be undone.`)) return;
    state.projects = state.projects.filter((p) => p.id !== project.id);
    state.subtasks = state.subtasks.filter((s) => s.projectId !== project.id);
    render();
    try {
      await api(`/api/projects/${project.id}`, { method: 'DELETE' });
      toast('Project deleted');
    } catch (e) {
      toast(e.message, true);
      loadBoard();
    }
  }

  async function createSubtask(projectId) {
    const siblings = state.subtasks.filter((s) => s.projectId === projectId);
    const order = siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 1;
    try {
      const subtask = await api('/api/subtasks', {
        method: 'POST',
        body: JSON.stringify({ name: 'New subtask', projectId, status: 'Not Started', order }),
      });
      state.subtasks.push(subtask);
      render();
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function saveSubtask(id, patch) {
    const subtask = state.subtasks.find((s) => s.id === id);
    if (subtask) Object.assign(subtask, patch);
    try {
      await api(`/api/subtasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function deleteSubtask(subtask) {
    state.subtasks = state.subtasks.filter((s) => s.id !== subtask.id);
    render();
    try {
      await api(`/api/subtasks/${subtask.id}`, { method: 'DELETE' });
    } catch (e) {
      toast(e.message, true);
      loadBoard();
    }
  }

  // ---------- Wiring ----------

  els.refreshBtn.addEventListener('click', () => loadBoard(true));
  els.addProjectBtn.addEventListener('click', () => { addingColumn = true; render(); });
  els.tabBoard.addEventListener('click', () => setActiveTab('board'));
  els.tabTasks.addEventListener('click', () => setActiveTab('tasks'));

  loadBoard();
  pollTimer = setInterval(() => loadBoard(), POLL_MS);
})();
