import { Router } from 'express';
import {
  getProductHandler,
  listCategoriesHandler,
  listProductsHandler,
} from './products.controller.js';

export const productsRouter = Router();
productsRouter.get('/', listProductsHandler);
productsRouter.get('/:slug', getProductHandler);

export const categoriesRouter = Router();
categoriesRouter.get('/', listCategoriesHandler);
