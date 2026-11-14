import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import {
  loginHandler,
  logoutEverywhereHandler,
  logoutHandler,
  registerHandler,
} from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', registerHandler);
authRouter.post('/login', loginHandler);
authRouter.post('/logout', logoutHandler);
authRouter.post('/logout-all', requireAuth, logoutEverywhereHandler);
