import type { Request, Response } from 'express';
import { listProductsQuerySchema } from './products.schemas.js';
import { getProductBySlug, listCategories, listProducts } from './products.service.js';

export async function listProductsHandler(req: Request, res: Response): Promise<void> {
  const query = listProductsQuerySchema.parse(req.query);
  res.json(await listProducts(query));
}

export async function getProductHandler(
  req: Request<{ slug: string }>,
  res: Response,
): Promise<void> {
  res.json({ data: await getProductBySlug(req.params.slug) });
}

export async function listCategoriesHandler(_req: Request, res: Response): Promise<void> {
  res.json({ data: await listCategories() });
}
