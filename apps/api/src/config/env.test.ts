import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const validSource = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/cartforge',
  REDIS_URL: 'redis://localhost:6379',
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
