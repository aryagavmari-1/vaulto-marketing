// Media reachability check.
//
// The $0 object store is the deployed marketing site itself: rendered graphic
// PNGs live at public/social/<graphicKey>.png and are served at
// ${mediaBaseUrl}/social/<graphicKey>.png once the site deploys. Pinterest fetches
// that URL directly (image_url media source), so there is no separate upload.
//
// Before a live post we HEAD the graphic URL; if it is not reachable we degrade
// that atom to manual rather than handing Pinterest a broken image.

/**
 * @param {string} url
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ ok: boolean, status: number|null, error?: string }>}
 */
export async function checkReachable(url, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { method: 'HEAD' });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: null, error: String(err.message || err) };
  }
}
