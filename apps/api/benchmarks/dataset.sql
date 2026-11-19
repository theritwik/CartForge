-- Benchmark catalog: 25 categories and 50,000 products with one image each.
-- Deterministic (fixed random seed), so every run measures the same data.
-- Run only through prepare-dataset.ts, which refuses any database not named *_bench.

TRUNCATE TABLE processed_stripe_events, payments, order_items, orders, cart_items, carts,
  sessions, users, product_images, products, categories CASCADE;

SELECT setseed(0.42);

INSERT INTO categories (id, name, slug, created_at, updated_at)
SELECT gen_random_uuid(), 'Category ' || n, 'category-' || n, now(), now()
FROM generate_series(1, 25) AS n;

WITH words AS (
  SELECT
    ARRAY['steel', 'cotton', 'brass', 'leather', 'wooden', 'ceramic', 'copper', 'linen',
          'bamboo', 'glass', 'wool', 'silk', 'stone', 'canvas', 'cast iron', 'marble'] AS materials,
    ARRAY['kettle', 'kurta', 'backpack', 'lamp', 'bottle', 'notebook', 'mat', 'wallet',
          'teapot', 'cushion', 'speaker', 'knife', 'shirt', 'bowl', 'jar', 'chair',
          'headphones', 'keyboard', 'tawa', 'saree'] AS items,
    ARRAY['handmade', 'durable', 'lightweight', 'compact', 'classic', 'modern', 'everyday',
          'premium', 'eco-friendly', 'portable'] AS qualities
),
rows AS (
  SELECT n,
         materials[1 + floor(random() * array_length(materials, 1))::int] AS material,
         items[1 + floor(random() * array_length(items, 1))::int] AS item,
         qualities[1 + floor(random() * array_length(qualities, 1))::int] AS quality,
         random() AS status_roll,
         random() AS price_roll,
         random() AS stock_roll,
         random() AS age_roll,
         1 + floor(random() * 25)::int AS category_number
  FROM generate_series(1, 50000) AS n, words
)
INSERT INTO products (id, category_id, name, slug, description, price_paise, status,
                      stock_quantity, reserved_quantity, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM categories WHERE slug = 'category-' || category_number),
       initcap(quality || ' ' || material || ' ' || item) || ' ' || n,
       'product-' || n,
       'A ' || quality || ' ' || item || ' made of ' || material
         || '. Designed for daily use, easy to clean, and built to last. Model ' || n || '.',
       (99 + floor(price_roll * 9900))::int * 100,
       (CASE WHEN status_roll < 0.90 THEN 'ACTIVE' WHEN status_roll < 0.95 THEN 'DRAFT'
             ELSE 'ARCHIVED' END)::product_status,
       floor(stock_roll * 200)::int,
       0,
       now() - (age_roll * interval '730 days'),
       now()
FROM rows;

INSERT INTO product_images (id, product_id, url, alt_text, position, created_at)
SELECT gen_random_uuid(), id, '/images/products/yoga-mat-6mm-1.svg', name || ' (placeholder image)', 0, now()
FROM products;

ANALYZE;
