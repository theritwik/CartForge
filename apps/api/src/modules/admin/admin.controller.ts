import type { Request, Response } from 'express';
import { adjustProductStock } from '../inventory/inventory.service.js';
import { getAdminOrder, listAdminOrders, transitionOrder } from '../orders/order-admin.service.js';
import {
  createCategory,
  createProduct,
  deleteCategory,
  getAdminProduct,
  listAdminCategories,
  listAdminProducts,
  updateCategory,
  updateProduct,
} from '../products/catalog-admin.service.js';
import {
  adminOrderQuerySchema,
  adminProductQuerySchema,
  categorySchema,
  createProductSchema,
  idParamsSchema,
  orderTransitionSchema,
  stockAdjustmentSchema,
  updateCategorySchema,
  updateProductSchema,
} from './admin.schemas.js';
import { getDashboard } from './dashboard.service.js';

// Every route here is behind requireAuth and requireRole('ADMIN'), applied by the router.

export async function dashboardHandler(_req: Request, res: Response): Promise<void> {
  res.json({ data: await getDashboard() });
}

export async function listProductsHandler(req: Request, res: Response): Promise<void> {
  res.json(await listAdminProducts(adminProductQuerySchema.parse(req.query)));
}

export async function getProductHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParamsSchema.parse(req.params);
  res.json({ data: await getAdminProduct(id) });
}

export async function createProductHandler(req: Request, res: Response): Promise<void> {
  const input = createProductSchema.parse(req.body);
  res.status(201).json({ data: await createProduct(input) });
}

export async function updateProductHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParamsSchema.parse(req.params);
  const input = updateProductSchema.parse(req.body);
  res.json({ data: await updateProduct(id, input) });
}

export async function adjustStockHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParamsSchema.parse(req.params);
  const { delta } = stockAdjustmentSchema.parse(req.body);
  await adjustProductStock(id, delta);
  res.json({ data: await getAdminProduct(id) });
}

export async function listCategoriesHandler(_req: Request, res: Response): Promise<void> {
  res.json({ data: await listAdminCategories() });
}

export async function createCategoryHandler(req: Request, res: Response): Promise<void> {
  const input = categorySchema.parse(req.body);
  res.status(201).json({ data: await createCategory(input) });
}

export async function updateCategoryHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParamsSchema.parse(req.params);
  const input = updateCategorySchema.parse(req.body);
  res.json({ data: await updateCategory(id, input) });
}

export async function deleteCategoryHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParamsSchema.parse(req.params);
  await deleteCategory(id);
  res.status(204).end();
}

export async function listOrdersHandler(req: Request, res: Response): Promise<void> {
  res.json(await listAdminOrders(adminOrderQuerySchema.parse(req.query)));
}

export async function getOrderHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParamsSchema.parse(req.params);
  res.json({ data: await getAdminOrder(id) });
}

export async function transitionOrderHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParamsSchema.parse(req.params);
  const { from, to } = orderTransitionSchema.parse(req.body);
  res.json({ data: await transitionOrder(id, from, to) });
}
