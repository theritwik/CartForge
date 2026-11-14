import type { Request, Response } from 'express';
import { authenticatedUser } from '../../middleware/authenticate.js';
import { listUsersQuerySchema } from './users.schemas.js';
import { listUsers } from './users.service.js';

export function getCurrentUserHandler(req: Request, res: Response): void {
  res.json({ data: authenticatedUser(req) });
}

export async function listUsersHandler(req: Request, res: Response): Promise<void> {
  res.json(await listUsers(listUsersQuerySchema.parse(req.query)));
}
