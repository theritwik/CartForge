import type { PublicUser } from '../modules/users/users.service.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the requireAuth middleware once the session cookie has been verified. */
      auth?: { user: PublicUser; sessionId: string };
    }
  }
}
