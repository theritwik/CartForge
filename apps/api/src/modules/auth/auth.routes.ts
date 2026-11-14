import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import {
  changePasswordHandler,
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
authRouter.post('/change-password', requireAuth, changePasswordHandler);
