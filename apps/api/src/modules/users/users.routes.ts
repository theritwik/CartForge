import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/authenticate.js';
import { getCurrentUserHandler, listUsersHandler } from './users.controller.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.get('/me', getCurrentUserHandler);
usersRouter.get('/', requireRole('ADMIN'), listUsersHandler);
