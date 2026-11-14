import type { PrismaClient, ProductStatus } from '../src/generated/prisma/client.js';

interface SeedProduct {
  name: string;
  slug: string;
  description: string;
  pricePaise: number;
  stockQuantity: number;
  status?: ProductStatus;
}

interface SeedCategory {
  name: string;
  slug: string;
  products: SeedProduct[];
}

const catalog: SeedCategory[] = [
  {
    name: 'Electronics',
    slug: 'electronics',
    products: [
      {
        name: 'Wireless Noise-Cancelling Headphones',
        slug: 'wireless-noise-cancelling-headphones',
        description:
          'Over-ear Bluetooth headphones with active noise cancellation, 30 hours of battery life, and a foldable design with a carry case.',
        pricePaise: 899_900,
        stockQuantity: 40,
      },
      {
        name: 'Mechanical Keyboard, 75% Layout',
        slug: 'mechanical-keyboard-75',
        description:
          'Hot-swappable mechanical keyboard with tactile switches, PBT keycaps, white backlighting, and USB-C or Bluetooth connectivity.',
        pricePaise: 549_900,
        stockQuantity: 25,
      },
      {
        name: '20000 mAh Power Bank',
        slug: 'power-bank-20000mah',
        description:
          'Fast-charging power bank with two USB-A ports and one USB-C port, 22.5 W output, and a battery level display.',
        pricePaise: 189_900,
        stockQuantity: 120,
      },
      {
        name: 'Smart Fitness Band',
        slug: 'smart-fitness-band',
        description:
          'Water-resistant fitness band with heart-rate and sleep tracking, a 1.5-inch AMOLED display, and 14 days of battery life.',
        pricePaise: 299_900,
        stockQuantity: 0,
      },
    ],
  },
  {
    name: 'Home & Kitchen',
    slug: 'home-kitchen',
    products: [
      {
        name: 'Stainless Steel Pressure Cooker, 5 L',
        slug: 'stainless-steel-pressure-cooker-5l',
        description:
          'Induction-compatible 5-litre pressure cooker with a tri-ply base, a gasket release system, and a five-year warranty.',
        pricePaise: 249_900,
        stockQuantity: 60,
      },
      {
        name: 'Cast Iron Dosa Tawa, 30 cm',
        slug: 'cast-iron-dosa-tawa-30cm',
        description:
          'Pre-seasoned cast iron tawa with even heat distribution, suitable for gas and induction cooktops.',
        pricePaise: 139_900,
        stockQuantity: 45,
      },
      {
        name: 'Cotton Bedsheet Set, King Size',
        slug: 'cotton-bedsheet-set-king',
        description:
          'A 300-thread-count pure cotton bedsheet with two pillow covers, in a block-printed Jaipur pattern.',
        pricePaise: 179_900,
        stockQuantity: 80,
      },
      {
        name: 'Glass Storage Jars, Set of 6',
        slug: 'glass-storage-jars-set-of-6',
        description:
          'Airtight borosilicate glass jars with bamboo lids, 750 ml each, for storing pulses, spices, and snacks.',
        pricePaise: 99_900,
        stockQuantity: 150,
      },
    ],
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    products: [
      {
        name: "Men's Cotton Kurta",
        slug: 'mens-cotton-kurta',
        description:
          'Straight-fit handloom cotton kurta with a mandarin collar and side pockets. Machine washable.',
        pricePaise: 129_900,
        stockQuantity: 90,
      },
      {
        name: "Women's Running Shoes",
        slug: 'womens-running-shoes',
        description:
          'Lightweight running shoes with a breathable mesh upper, cushioned midsole, and a durable rubber outsole.',
        pricePaise: 349_900,
        stockQuantity: 55,
      },
      {
        name: 'Leather Bifold Wallet',
        slug: 'leather-bifold-wallet',
        description:
          'Full-grain leather wallet with six card slots, two note compartments, and RFID-blocking lining.',
        pricePaise: 149_900,
        stockQuantity: 70,
      },
      {
        name: 'Canvas Backpack, 25 L',
        slug: 'canvas-backpack-25l',
        description:
          'Water-resistant canvas backpack with a padded 15-inch laptop sleeve and a side bottle pocket.',
        pricePaise: 219_900,
        stockQuantity: 35,
      },
    ],
  },
  {
    name: 'Books',
    slug: 'books',
    products: [
      {
        name: 'Designing Data-Intensive Applications',
        slug: 'designing-data-intensive-applications',
        description:
          'A guide to the principles behind reliable, scalable, and maintainable data systems. Paperback, 616 pages.',
        pricePaise: 159_900,
        stockQuantity: 30,
      },
      {
        name: 'The Pragmatic Programmer',
        slug: 'the-pragmatic-programmer',
        description:
          'The 20th anniversary edition of the classic book on the craft of software development. Hardcover, 352 pages.',
        pricePaise: 249_900,
        stockQuantity: 20,
      },
      {
        name: 'A History of Modern India',
        slug: 'a-history-of-modern-india',
        description:
          'An accessible survey of Indian history from the eighteenth century to independence. Paperback, 480 pages.',
        pricePaise: 59_900,
        stockQuantity: 65,
      },
      {
        name: 'Everyday Indian Cooking',
        slug: 'everyday-indian-cooking',
        description:
          'More than 120 home-style vegetarian recipes with step-by-step photographs. Hardcover, 288 pages.',
        pricePaise: 89_900,
        stockQuantity: 50,
        status: 'DRAFT',
      },
    ],
  },
  {
    name: 'Sports & Fitness',
    slug: 'sports-fitness',
    products: [
      {
        name: 'Yoga Mat, 6 mm',
        slug: 'yoga-mat-6mm',
        description:
          'Non-slip TPE yoga mat, 183 cm by 61 cm, with alignment lines and a carry strap.',
        pricePaise: 119_900,
        stockQuantity: 110,
      },
      {
        name: 'Adjustable Dumbbells, 20 kg Pair',
        slug: 'adjustable-dumbbells-20kg',
        description:
          'A pair of adjustable dumbbells with cast iron plates and chrome handles, from 2.5 kg to 10 kg each.',
        pricePaise: 449_900,
        stockQuantity: 15,
      },
      {
        name: 'English Willow Cricket Bat',
        slug: 'english-willow-cricket-bat',
        description:
          'Grade 2 English willow bat, short handle, with a thick edge profile and a protective cover.',
        pricePaise: 799_900,
        stockQuantity: 12,
      },
      {
        name: 'Insulated Steel Water Bottle, 1 L',
        slug: 'insulated-steel-water-bottle-1l',
        description:
          'Double-walled stainless steel bottle that keeps drinks cold for 24 hours or hot for 12 hours.',
        pricePaise: 79_900,
        stockQuantity: 200,
      },
    ],
  },
];

// Labelled placeholder drawings served by the web app from apps/web/public.
function placeholderImages(product: SeedProduct) {
  return [
    {
      position: 0,
      url: `/images/products/${product.slug}-1.svg`,
      altText: `${product.name} (placeholder image)`,
    },
    {
      position: 1,
      url: `/images/products/${product.slug}-2.svg`,
      altText: `${product.name}, close-up (placeholder image)`,
    },
  ];
}

export interface SeedSummary {
  categories: number;
  products: number;
  images: number;
}

/**
 * Inserts or updates the development catalog, matching rows by slug. Running it
 * again changes nothing. Stock is set only when a product is first created, so
 * re-seeding does not undo stock changes made while developing.
 */
export async function seedCatalog(prisma: PrismaClient): Promise<SeedSummary> {
  const summary: SeedSummary = { categories: 0, products: 0, images: 0 };

  await prisma.$transaction(
    async (tx) => {
      for (const category of catalog) {
        const savedCategory = await tx.category.upsert({
          where: { slug: category.slug },
          update: { name: category.name },
          create: { name: category.name, slug: category.slug },
        });
        summary.categories += 1;

        for (const product of category.products) {
          const catalogFields = {
            categoryId: savedCategory.id,
            name: product.name,
            description: product.description,
            pricePaise: product.pricePaise,
            status: product.status ?? 'ACTIVE',
          };
          const savedProduct = await tx.product.upsert({
            where: { slug: product.slug },
            update: catalogFields,
            create: { ...catalogFields, slug: product.slug, stockQuantity: product.stockQuantity },
          });
          summary.products += 1;

          for (const { position, ...image } of placeholderImages(product)) {
            await tx.productImage.upsert({
              where: { productId_position: { productId: savedProduct.id, position } },
              update: image,
              create: { ...image, productId: savedProduct.id, position },
            });
            summary.images += 1;
          }
        }
      }
    },
    { timeout: 30_000 },
  );

  return summary;
}
