import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/authenticate.js';
import { limitAdminWrites } from '../../middleware/rate-limit-writes.js';
import {
  adjustStockHandler,
  createCategoryHandler,
  createProductHandler,
  dashboardHandler,
  deleteCategoryHandler,
  getOrderHandler,
  getProductHandler,
  listCategoriesHandler,
  listOrdersHandler,
  listProductsHandler,
  listStockAdjustmentsHandler,
  transitionOrderHandler,
  updateCategoryHandler,
  updateProductHandler,
} from './admin.controller.js';

export const adminRouter = Router();

// Applied to every route below. Hiding pages in the web app is not the protection; this is.
adminRouter.use(requireAuth, requireRole('ADMIN'), limitAdminWrites);

adminRouter.get('/dashboard', dashboardHandler);

adminRouter.get('/products', listProductsHandler);
adminRouter.post('/products', createProductHandler);
adminRouter.get('/products/:id', getProductHandler);
adminRouter.patch('/products/:id', updateProductHandler);
adminRouter.get('/products/:id/stock-adjustments', listStockAdjustmentsHandler);
adminRouter.post('/products/:id/stock-adjustments', adjustStockHandler);

adminRouter.get('/categories', listCategoriesHandler);
adminRouter.post('/categories', createCategoryHandler);
adminRouter.patch('/categories/:id', updateCategoryHandler);
adminRouter.delete('/categories/:id', deleteCategoryHandler);

adminRouter.get('/orders', listOrdersHandler);
adminRouter.get('/orders/:id', getOrderHandler);
adminRouter.post('/orders/:id/transitions', transitionOrderHandler);
