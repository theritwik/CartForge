import type { Request, Response } from 'express';
import { authenticatedUser } from '../../middleware/authenticate.js';
import { addCartItemSchema, cartItemParamsSchema, updateCartItemSchema } from './cart.schemas.js';
import {
  addCartItem,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItemQuantity,
} from './cart.service.js';

// Every handler takes the user from the session. No route accepts a user or cart id.

export async function getCartHandler(req: Request, res: Response): Promise<void> {
  res.json({ data: await getCart(authenticatedUser(req).id) });
}

export async function addCartItemHandler(req: Request, res: Response): Promise<void> {
  const input = addCartItemSchema.parse(req.body);
  res.json({ data: await addCartItem(authenticatedUser(req).id, input) });
}

export async function updateCartItemHandler(req: Request, res: Response): Promise<void> {
  const { itemId } = cartItemParamsSchema.parse(req.params);
  const { quantity } = updateCartItemSchema.parse(req.body);
  res.json({ data: await updateCartItemQuantity(authenticatedUser(req).id, itemId, quantity) });
}

export async function removeCartItemHandler(req: Request, res: Response): Promise<void> {
  const { itemId } = cartItemParamsSchema.parse(req.params);
  res.json({ data: await removeCartItem(authenticatedUser(req).id, itemId) });
}

export async function clearCartHandler(req: Request, res: Response): Promise<void> {
  res.json({ data: await clearCart(authenticatedUser(req).id) });
}
