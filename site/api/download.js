// Sends the browser to a download of one release asset. For a private repo GitHub only hands out
// the file to an authenticated request, so this asks GitHub (with the server-side token) for the
// short-lived signed link and redirects to it. The APK itself never passes through this function.

const REPO = process.env.GITHUB_REPO || 'CodeKheb/Clingy';

module.exports = async (req, res) => {
  const id = String(req.query.id || '');
  if (!/^\d{1,15}$/.test(id)) return res.status(400).json({ error: 'bad asset id' });

  try {
    const headers = { Accept: 'application/octet-stream', 'User-Agent': 'clingy-site' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    // The asset id is looked up inside this repo's releases, so it can't be used to read anything else.
    const upstream = await fetch(`https://api.github.com/repos/${REPO}/releases/assets/${id}`, { headers, redirect: 'manual' });
    const location = upstream.headers.get('location');
    if (upstream.status >= 300 && upstream.status < 400 && location) {
      res.setHeader('Cache-Control', 'no-store'); // the signed link expires quickly
      res.setHeader('Location', location);
      return res.status(302).end();
    }
    return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'asset not available' });
  } catch (e) {
    return res.status(500).json({ error: 'could not reach GitHub' });
  }
};
