import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import { initiatePaymentHandler } from './payments.controller.js';

export const paymentsRouter = Router();

paymentsRouter.post('/orders/:orderId/payments', requireAuth, initiatePaymentHandler);
