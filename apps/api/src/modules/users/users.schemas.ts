import { z } from 'zod';
import { wholeNumber } from '../../lib/query-params.js';

export const listUsersQuerySchema = z.object({
  page: wholeNumber(1, 10_000).default(1),
  pageSize: wholeNumber(1, 100).default(20),
});
