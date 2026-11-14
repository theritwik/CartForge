import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import {
  addCartItemHandler,
  clearCartHandler,
  getCartHandler,
  removeCartItemHandler,
  updateCartItemHandler,
} from './cart.controller.js';

export const cartRouter = Router();

cartRouter.use(requireAuth);
cartRouter.get('/', getCartHandler);
cartRouter.delete('/', clearCartHandler);
cartRouter.post('/items', addCartItemHandler);
cartRouter.patch('/items/:itemId', updateCartItemHandler);
cartRouter.delete('/items/:itemId', removeCartItemHandler);
