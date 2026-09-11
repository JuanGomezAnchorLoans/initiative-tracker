const { checkAccess, updateProject, archiveProject } = require('../lib/notion');

module.exports = async (req, res) => {
  if (!checkAccess(req, res)) return;
  const { id } = req.query;

  try {
    if (req.method === 'PATCH') {
      const project = await updateProject(id, req.body || {});
      res.status(200).json(project);
      return;
    }
    if (req.method === 'DELETE') {
      await archiveProject(id);
      res.status(204).end();
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};
