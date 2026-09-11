// Shared helper for talking to the Notion API and mapping between
// Notion's property format and the plain JSON the frontend uses.

const NOTION_VERSION = '2022-06-28';
const BASE_URL = 'https://api.notion.com/v1';

function assertEnv() {
  const missing = [];
  if (!process.env.NOTION_TOKEN) missing.push('NOTION_TOKEN');
  if (!process.env.NOTION_PROJECTS_DB_ID) missing.push('NOTION_PROJECTS_DB_ID');
  if (!process.env.NOTION_SUBTASKS_DB_ID) missing.push('NOTION_SUBTASKS_DB_ID');
  if (missing.length) {
    const err = new Error('Missing environment variable(s): ' + missing.join(', '));
    err.statusCode = 500;
    throw err;
  }
}

async function notion(path, options = {}) {
  assertEnv();
  const res = await fetch(BASE_URL + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || `Notion API error (${res.status})`);
    err.statusCode = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

// ---------- Access code gate (optional) ----------
// If BOARD_ACCESS_CODE is set in the environment, every write (and read, by
// default) must include a matching x-board-key header. Leave the env var
// unset to run the board with no gate at all.
function checkAccess(req, res) {
  const required = process.env.BOARD_ACCESS_CODE;
  if (!required) return true;
  const provided = req.headers['x-board-key'];
  if (provided === required) return true;
  res.status(401).json({ error: 'Invalid or missing board access code.' });
  return false;
}

// ---------- Projects ----------

function projectFromPage(page) {
  const p = page.properties;
  return {
    id: page.id,
    name: rt(p.Name?.title),
    owner: rt(p.Owner?.rich_text),
    dueDate: p['Master Due Date']?.date?.start || null,
    order: p.Order?.number ?? 0,
    color: p.Color?.select?.name || 'Blue',
  };
}

function projectProperties(body) {
  const props = {};
  if (body.name !== undefined) props['Name'] = title(body.name);
  if (body.owner !== undefined) props['Owner'] = richText(body.owner);
  if (body.dueDate !== undefined) props['Master Due Date'] = dateProp(body.dueDate);
  if (body.order !== undefined) props['Order'] = { number: Number(body.order) };
  if (body.color !== undefined) props['Color'] = selectProp(body.color);
  return props;
}

async function listProjects() {
  const dbId = process.env.NOTION_PROJECTS_DB_ID;
  const data = await notion(`/databases/${dbId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      sorts: [{ property: 'Order', direction: 'ascending' }],
      page_size: 100,
    }),
  });
  return data.results.map(projectFromPage);
}

async function createProject(body) {
  const dbId = process.env.NOTION_PROJECTS_DB_ID;
  const page = await notion('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: projectProperties(body),
    }),
  });
  return projectFromPage(page);
}

async function updateProject(id, body) {
  const page = await notion(`/pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: projectProperties(body) }),
  });
  return projectFromPage(page);
}

async function archiveProject(id) {
  // Cascade-archive any subtasks that belong to this project first.
  const dbId = process.env.NOTION_SUBTASKS_DB_ID;
  const data = await notion(`/databases/${dbId}/query`, {
    method: 'POST',
    body: JSON.stringify({ filter: { property: 'Project', relation: { contains: id } } }),
  });
  await Promise.all(
    data.results.map((page) =>
      notion(`/pages/${page.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
    )
  );
  await notion(`/pages/${id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) });
}

// ---------- Subtasks ----------

function subtaskFromPage(page) {
  const p = page.properties;
  return {
    id: page.id,
    name: rt(p.Name?.title),
    projectId: p.Project?.relation?.[0]?.id || null,
    owner: rt(p.Owner?.rich_text),
    dueDate: p['Due Date']?.date?.start || null,
    status: p.Status?.select?.name || 'Not Started',
    order: p.Order?.number ?? 0,
  };
}

function subtaskProperties(body) {
  const props = {};
  if (body.name !== undefined) props['Name'] = title(body.name);
  if (body.owner !== undefined) props['Owner'] = richText(body.owner);
  if (body.dueDate !== undefined) props['Due Date'] = dateProp(body.dueDate);
  if (body.order !== undefined) props['Order'] = { number: Number(body.order) };
  if (body.status !== undefined) props['Status'] = selectProp(body.status);
  if (body.projectId !== undefined) {
    props['Project'] = body.projectId ? { relation: [{ id: body.projectId }] } : { relation: [] };
  }
  return props;
}

async function listSubtasks() {
  const dbId = process.env.NOTION_SUBTASKS_DB_ID;
  const data = await notion(`/databases/${dbId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      sorts: [{ property: 'Order', direction: 'ascending' }],
      page_size: 100,
    }),
  });
  return data.results.map(subtaskFromPage);
}

async function createSubtask(body) {
  const dbId = process.env.NOTION_SUBTASKS_DB_ID;
  const page = await notion('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: subtaskProperties(body),
    }),
  });
  return subtaskFromPage(page);
}

async function updateSubtask(id, body) {
  const page = await notion(`/pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: subtaskProperties(body) }),
  });
  return subtaskFromPage(page);
}

async function archiveSubtask(id) {
  await notion(`/pages/${id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) });
}

// ---------- Notion property builders/readers ----------

function rt(arr) {
  return (arr || []).map((t) => t.plain_text).join('');
}
function title(value) {
  return { title: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [] };
}
function richText(value) {
  return { rich_text: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [] };
}
function dateProp(value) {
  return { date: value ? { start: value } : null };
}
function selectProp(value) {
  return { select: value ? { name: String(value) } : null };
}

module.exports = {
  checkAccess,
  listProjects,
  createProject,
  updateProject,
  archiveProject,
  listSubtasks,
  createSubtask,
  updateSubtask,
  archiveSubtask,
};
