import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const validSource = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/cartforge',
  REDIS_URL: 'redis://localhost:6379',
  CACHE_REDIS_URL: 'redis://localhost:6380',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('parseEnv', () => {
  it('applies defaults for optional settings', () => {
    expect(parseEnv(validSource)).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 4000,
      LOG_LEVEL: 'info',
    });
  });

  it('reduces the web origin to scheme, host, and port', () => {
    expect(
      parseEnv({ ...validSource, WEB_ORIGIN: 'https://shop.example.com/some/path' }),
    ).toMatchObject({ WEB_ORIGIN: 'https://shop.example.com' });
  });

  it('requires the cache to be configured apart from the rate-limit Redis', () => {
    expect(() => parseEnv({ ...validSource, CACHE_REDIS_URL: undefined })).toThrow(
      /CACHE_REDIS_URL/,
    );
    expect(() => parseEnv({ ...validSource, CACHE_REDIS_URL: validSource.REDIS_URL })).toThrow(
      /must not be the same as REDIS_URL/,
    );
  });

  describe('Stripe configuration', () => {
    const stripeSource = {
      ...validSource,
      STRIPE_SECRET_KEY: 'sk_test_example',
      STRIPE_WEBHOOK_SECRET: 'whsec_example',
    };

    it('accepts a test-mode key with a webhook secret', () => {
      expect(parseEnv(stripeSource)).toMatchObject({ STRIPE_SECRET_KEY: 'sk_test_example' });
    });

    it('treats empty values as not set, which selects the development simulator', () => {
      const env = parseEnv({ ...validSource, STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '' });

      expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    });

    it.each(['sk_live_example', 'pk_test_example', 'rk_live_example'])(
      'rejects the key %s',
      (key) => {
        expect(() => parseEnv({ ...stripeSource, STRIPE_SECRET_KEY: key })).toThrow(
          /STRIPE_SECRET_KEY/,
        );
      },
    );

    it('requires the webhook secret when a key is set', () => {
      expect(() => parseEnv({ ...stripeSource, STRIPE_WEBHOOK_SECRET: undefined })).toThrow(
        /STRIPE_WEBHOOK_SECRET/,
      );
    });

    it('refuses to run in production without a Stripe key', () => {
      expect(() => parseEnv({ ...validSource, NODE_ENV: 'production' })).toThrow(
        /STRIPE_SECRET_KEY/,
      );
    });
  });

  it('converts the port to a number', () => {
    expect(parseEnv({ ...validSource, API_PORT: '8080' }).API_PORT).toBe(8080);
  });

  it('rejects a missing database URL', () => {
    expect(() => parseEnv({ ...validSource, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('rejects a database URL with the wrong protocol', () => {
    expect(() => parseEnv({ ...validSource, DATABASE_URL: 'mysql://localhost/cartforge' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects a port outside the valid range', () => {
    expect(() => parseEnv({ ...validSource, API_PORT: '70000' })).toThrow(/API_PORT/);
  });
});
