// Lists the app's GitHub releases for the download page. The repo is private, so this runs on the
// server with a read-only token (Vercel env var GITHUB_TOKEN) that the browser never sees.
// Only what the page needs is returned, and drafts are left out.

const REPO = process.env.GITHUB_REPO || 'CodeKheb/Clingy';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  try {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'clingy-site' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    const upstream = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, { headers });
    if (!upstream.ok) {
      return res.status(502).json({ error: `GitHub answered ${upstream.status}` });
    }
    const releases = (await upstream.json())
      .filter((r) => !r.draft && !r.prerelease)
      .map((r) => ({
        tag_name: r.tag_name,
        name: r.name,
        body: r.body,
        published_at: r.published_at,
        assets: (r.assets || []).map((a) => ({ id: a.id, name: a.name, size: a.size, download_count: a.download_count })),
      }));

    // Cached at the edge so a busy page doesn't burn through GitHub's rate limit.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(releases);
  } catch (e) {
    return res.status(500).json({ error: 'could not reach GitHub' });
  }
};
