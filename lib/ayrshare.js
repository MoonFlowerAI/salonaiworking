/**
 * Ayrshare social media posting wrapper.
 *
 * Env-gated: if AYRSHARE_API_KEY is missing, all helpers return
 * { skipped: true } and the app still runs fine.
 *
 * Required env vars when enabled:
 *   AYRSHARE_API_KEY   — your Ayrshare API key (Business plan required for profiles)
 *
 * Per-tenant profile key is stored in business.json (field: ayrshareProfileKey).
 */

const API_KEY = process.env.AYRSHARE_API_KEY;
const BASE_URL = 'https://app.ayrshare.com/api';

function isEnabled() {
  return !!API_KEY;
}

function headers(profileKey) {
  const h = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
  };
  if (profileKey) h['Profile-Key'] = profileKey;
  return h;
}

/**
 * Schedule a social media post.
 * @param {object} opts
 * @param {string} opts.profileKey   - Ayrshare tenant profile key
 * @param {string} opts.caption      - post text
 * @param {string[]} opts.platforms  - e.g. ['instagram','facebook']
 * @param {string[]} [opts.mediaUrls] - public image/video URLs
 * @param {string}  [opts.scheduleDate] - ISO 8601 UTC datetime; omit to post now
 */
async function schedulePost({ profileKey, caption, platforms, mediaUrls, scheduleDate }) {
  if (!API_KEY) return { skipped: true, reason: 'AYRSHARE_API_KEY not set' };

  const body = { post: caption, platforms: platforms || [] };
  if (mediaUrls && mediaUrls.length) body.mediaUrls = mediaUrls;
  if (scheduleDate) body.scheduleDate = scheduleDate;

  try {
    const res = await fetch(`${BASE_URL}/post`, {
      method: 'POST',
      headers: headers(profileKey),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[ayrshare] schedulePost error:', data);
      return { skipped: true, error: data };
    }
    return { ok: true, ...data };
  } catch (err) {
    console.error('[ayrshare] schedulePost fetch error:', err.message);
    return { skipped: true, error: err.message };
  }
}

/**
 * List recent posts for a tenant profile.
 */
async function listPosts({ profileKey, lastDays = 30 }) {
  if (!API_KEY) return { skipped: true, posts: [] };

  try {
    const res = await fetch(`${BASE_URL}/history?lastDays=${lastDays}`, {
      headers: headers(profileKey),
    });
    const data = await res.json();
    if (!res.ok) return { skipped: true, error: data, posts: [] };
    return { ok: true, posts: data.history || data || [] };
  } catch (err) {
    console.error('[ayrshare] listPosts error:', err.message);
    return { skipped: true, posts: [], error: err.message };
  }
}

/**
 * Cancel/delete a scheduled post.
 */
async function deletePost({ profileKey, postId }) {
  if (!API_KEY) return { skipped: true };

  try {
    const res = await fetch(`${BASE_URL}/post`, {
      method: 'DELETE',
      headers: headers(profileKey),
      body: JSON.stringify({ id: postId }),
    });
    const data = await res.json();
    if (!res.ok) return { skipped: true, error: data };
    return { ok: true, ...data };
  } catch (err) {
    console.error('[ayrshare] deletePost error:', err.message);
    return { skipped: true, error: err.message };
  }
}

module.exports = { schedulePost, listPosts, deletePost, isEnabled };
