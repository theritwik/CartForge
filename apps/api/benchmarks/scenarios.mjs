/** The catalog requests measured. Each mirrors a storefront page. */
export const scenarios = [
  { name: 'list: default page', path: '/api/v1/products' },
  {
    name: 'list: category, price sort',
    path: '/api/v1/products?category=category-7&sort=price_asc',
  },
  { name: 'list: deep page', path: '/api/v1/products?page=300' },
  { name: 'list: price sort, all', path: '/api/v1/products?sort=price_desc' },
  { name: 'list: search (two terms)', path: '/api/v1/products?q=steel%20kettle' },
  { name: 'list: search, price filter', path: '/api/v1/products?q=brass&maxPricePaise=500000' },
  { name: 'product detail', path: '/api/v1/products/product-12345' },
  { name: 'categories', path: '/api/v1/categories' },
];
