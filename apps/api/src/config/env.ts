import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    // The catalog cache. A separate instance from REDIS_URL, configured to evict under memory pressure.
    CACHE_REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    // The origin browsers load the web app from. State-changing requests must come from it.
    WEB_ORIGIN: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin),
    // Number of reverse proxies in front of the API whose X-Forwarded-For entry is trusted.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    SESSION_IDLE_TIMEOUT_DAYS: z.coerce.number().int().min(1).max(365).default(7),
    SESSION_ABSOLUTE_TIMEOUT_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    // Stripe test mode only. Live keys are rejected so real payments cannot be taken by mistake.
    // Left unset outside production, payments use the local development simulator.
    STRIPE_SECRET_KEY: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^sk_test_/, 'Only a Stripe test-mode secret key (sk_test_...) is accepted')
        .optional(),
    ),
    STRIPE_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  })
  .superRefine((config, context) => {
    if (config.CACHE_REDIS_URL === config.REDIS_URL) {
      context.addIssue({
        code: 'custom',
        path: ['CACHE_REDIS_URL'],
        message:
          'must not be the same as REDIS_URL: cache eviction could remove rate-limit counters',
      });
    }
    if (config.STRIPE_SECRET_KEY && !config.STRIPE_WEBHOOK_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['STRIPE_WEBHOOK_SECRET'],
        message: 'Required when STRIPE_SECRET_KEY is set',
      });
    }
    if (config.NODE_ENV === 'production' && !config.STRIPE_SECRET_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: 'Required in production: the payment simulator is for development only',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
