const { checkAccess, listProjects, listSubtasks } = require('./lib/notion');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!checkAccess(req, res)) return;

  try {
    const [projects, subtasks] = await Promise.all([listProjects(), listSubtasks()]);
    res.status(200).json({ projects, subtasks, syncedAt: new Date().toISOString() });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};
