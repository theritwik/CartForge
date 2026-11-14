import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  // The origin browsers load the web app from. State-changing requests must come from it.
  WEB_ORIGIN: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin),
  // Number of reverse proxies in front of the API whose X-Forwarded-For entry is trusted.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  SESSION_IDLE_TIMEOUT_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  SESSION_ABSOLUTE_TIMEOUT_DAYS: z.coerce.number().int().min(1).max(365).default(30),
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
