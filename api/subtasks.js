const { checkAccess, createSubtask } = require('./lib/notion');

module.exports = async (req, res) => {
  if (!checkAccess(req, res)) return;

  if (req.method === 'POST') {
    try {
      const subtask = await createSubtask(req.body || {});
      res.status(201).json(subtask);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
