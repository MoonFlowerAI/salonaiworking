/**
 * Social posts admin routes (per tenant).
 *
 *   GET  /api/posts             — list scheduled + sent posts (Ayrshare history)
 *   POST /api/posts/schedule    — schedule a post (caption, mediaUrls, platforms, date)
 *   DELETE /api/posts/:id       — cancel a scheduled post by Ayrshare id
 *   GET  /api/posts/queue       — local queue: posts saved on disk waiting
 *                                 for operator approval before being sent
 *   POST /api/posts/queue/:id/approve   — approve a queued post → push to Ayrshare
 *
 * The tenant's Ayrshare Profile Key is read from business.json
 * (field: ayrshareProfileKey). Set this once during tenant onboarding.
 */

const express = require('express');
const router = express.Router();

const { readCollection, writeCollection } = require('../db');
const { schedulePost, listPosts, deletePost, isEnabled } = require('../lib/ayrshare');

async function getProfileKey(tenantId) {
  const biz = (await readCollection('business', tenantId).catch(() => null)) || {};
  return biz.ayrshareProfileKey || null;
}

// GET /api/posts — list this tenant's recent posts (sent + scheduled)
router.get('/', async (req, res) => {
  const profileKey = await getProfileKey(req.tenantId);
  if (!profileKey) return res.json({ enabled: false, reason: 'no profileKey', posts: [] });
  const result = await listPosts({ profileKey, lastDays: Number(req.query.lastDays) || 30 });
  res.json({ enabled: isEnabled(), ...result });
});

// POST /api/posts/schedule — schedule one post
router.post('/schedule', async (req, res) => {
  const { caption, platforms, mediaUrls, scheduleDate } = req.body || {};
  const profileKey = await getProfileKey(req.tenantId);
  if (!profileKey) return res.status(400).json({ error: 'no profileKey for tenant' });
  const result = await schedulePost({ profileKey, caption, platforms, mediaUrls, scheduleDate });
  res.json(result);
});

// DELETE /api/posts/:id — cancel a scheduled post
router.delete('/:id', async (req, res) => {
  const profileKey = await getProfileKey(req.tenantId);
  if (!profileKey) return res.status(400).json({ error: 'no profileKey for tenant' });
  const result = await deletePost({ profileKey, postId: req.params.id });
  res.json(result);
});

// ──────────────────────────────────────────────────────────────
// Local approval queue: AI generates a post, operator approves,
// approval pushes to Ayrshare. Lets us catch bad output before
// it goes live on a real client account.
// ──────────────────────────────────────────────────────────────

// GET /api/posts/queue — list pending-approval posts saved on disk
router.get('/queue', async (req, res) => {
  const queue = (await readCollection('post-queue', req.tenantId)) || [];
  res.json({ queue });
});

// POST /api/posts/queue — save a post to the local approval queue
// Body: { caption, mediaUrls, platforms, scheduleDate, source: 'make-promo|content-pack|manual' }
router.post('/queue', async (req, res) => {
  const queue = (await readCollection('post-queue', req.tenantId)) || [];
  const item = {
    id: 'q_' + Math.random().toString(36).slice(2, 11),
    createdAt: new Date().toISOString(),
    status: 'pending',
    ...req.body,
  };
  queue.unshift(item);
  if (queue.length > 100) queue.length = 100;
  await writeCollection('post-queue', queue, req.tenantId);
  res.json(item);
});

// POST /api/posts/queue/:id/approve — push the queued item to Ayrshare
router.post('/queue/:id/approve', async (req, res) => {
  const queue = (await readCollection('post-queue', req.tenantId)) || [];
  const item = queue.find(q => q.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  if (item.status !== 'pending') return res.status(400).json({ error: 'already ' + item.status });

  const profileKey = await getProfileKey(req.tenantId);
  if (!profileKey) return res.status(400).json({ error: 'no profileKey for tenant' });

  const result = await schedulePost({
    profileKey,
    caption: item.caption,
    platforms: item.platforms,
    mediaUrls: item.mediaUrls,
    scheduleDate: item.scheduleDate,
  });
  item.status = result.skipped ? 'failed' : 'approved';
  item.ayrshareResult = result;
  item.approvedAt = new Date().toISOString();
  await writeCollection('post-queue', queue, req.tenantId);
  res.json(item);
});

// POST /api/posts/queue/:id/reject — mark queued item rejected (no API call)
router.post('/queue/:id/reject', async (req, res) => {
  const queue = (await readCollection('post-queue', req.tenantId)) || [];
  const item = queue.find(q => q.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  item.status = 'rejected';
  item.rejectedAt = new Date().toISOString();
  item.rejectReason = req.body?.reason || null;
  await writeCollection('post-queue', queue, req.tenantId);
  res.json(item);
});

module.exports = router;
