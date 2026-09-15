import { Router } from 'express';
import type { AuthedRequest } from '../session.js';
import { getUser } from '../users.js';

export const sessionRouter = Router();

sessionRouter.get('/api/session', (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.json({ authenticated: false });
    return;
  }
  const user = getUser(req.userId);
  if (!user) {
    res.json({ authenticated: false });
    return;
  }
  res.json({
    authenticated: true,
    healthUserId: user.health_user_id,
    displayName: user.display_name,
  });
});
