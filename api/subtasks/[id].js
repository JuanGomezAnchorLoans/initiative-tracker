const { checkAccess, updateSubtask, archiveSubtask } = require('../lib/notion');

module.exports = async (req, res) => {
  if (!checkAccess(req, res)) return;
  const { id } = req.query;

  try {
    if (req.method === 'PATCH') {
      const subtask = await updateSubtask(id, req.body || {});
      res.status(200).json(subtask);
      return;
    }
    if (req.method === 'DELETE') {
      await archiveSubtask(id);
      res.status(204).end();
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};
