import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import {
  cancelOrderHandler,
  checkoutHandler,
  getOrderHandler,
  listOrdersHandler,
} from './orders.controller.js';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);
ordersRouter.post('/', checkoutHandler);
ordersRouter.get('/', listOrdersHandler);
ordersRouter.get('/:orderId', getOrderHandler);
ordersRouter.post('/:orderId/cancel', cancelOrderHandler);
