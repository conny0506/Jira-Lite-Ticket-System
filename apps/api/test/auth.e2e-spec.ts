import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthRateLimitService } from '../src/auth/auth-rate-limit.service';
import { AuthService } from '../src/auth/auth.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  const authServiceMock = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    getActorOrThrow: jest.fn(),
  };

  const authRateLimitServiceMock = {
    increment: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: AuthRateLimitService, useValue: authRateLimitServiceMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authRateLimitServiceMock.increment.mockResolvedValue({
      allowed: true,
      count: 1,
      resetAt: Date.now() + 60_000,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login returns token bundle', async () => {
    authServiceMock.login.mockResolvedValue({
      accessToken: 'access-token',
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshToken: 'refresh-token',
      user: {
        id: 'u1',
        name: 'Captain',
        email: 'captain@example.com',
        role: 'CAPTAIN',
        active: true,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'captain@example.com', password: '1234' })
      .expect(201);

    expect(res.body.accessToken).toBe('access-token');
    expect(res.body.user.email).toBe('captain@example.com');
    expect(authServiceMock.login).toHaveBeenCalledTimes(1);
  });

  it('POST /auth/refresh without token returns 401', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').send({}).expect(401);
    expect(authServiceMock.refresh).not.toHaveBeenCalled();
  });

  it('POST /auth/login returns 429 when rate limit is exceeded', async () => {
    authRateLimitServiceMock.increment.mockResolvedValue({
      allowed: false,
      count: 999,
      resetAt: Date.now() + 60_000,
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'captain@example.com', password: '1234' })
      .expect(429);
  });
});
