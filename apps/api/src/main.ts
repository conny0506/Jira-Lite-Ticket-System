import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { ValidationError } from 'class-validator';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { PrismaService } from './prisma/prisma.service';

function mapValidationError(error: ValidationError): string[] {
  const constraints = error.constraints ?? {};
  const rules: Record<string, string> = {
    isEmail: `${error.property} alanı geçerli bir e-posta olmalıdır`,
    isString: `${error.property} alanı metin olmalıdır`,
    isEnum: `${error.property} alanı izin verilen değerlerden biri olmalıdır`,
    isArray: `${error.property} alanı dizi olmalıdır`,
    isBoolean: `${error.property} alanı true/false olmalıdır`,
    arrayMaxSize: `${error.property} alanı izin verilenden fazla öğe içeriyor`,
    length: `${error.property} alanı uzunluk kuralını sağlamıyor`,
    whitelistValidation: `${error.property} alanı izin verilen bir alan değildir`,
  };

  const current = Object.keys(constraints).map(
    (key) => rules[key] ?? constraints[key],
  );
  const nested = (error.children ?? []).flatMap((child) =>
    mapValidationError(child),
  );
  return [...current, ...nested];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logFormat = (process.env.LOG_FORMAT ?? 'json').toLowerCase();
  app.use((req: any, res: any, next: () => void) => {
    const requestId =
      (req.headers?.['x-request-id'] as string | undefined)?.trim() || randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const startedAt = Date.now();
    res.on('finish', () => {
      const elapsedMs = Date.now() - startedAt;
      if (logFormat === 'text') {
        // eslint-disable-next-line no-console
        console.log(
          `[${requestId}] ${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${elapsedMs}ms`,
        );
        return;
      }
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          level: 'info',
          event: 'http_request',
          requestId,
          method: req.method,
          path: req.originalUrl || req.url,
          statusCode: res.statusCode,
          durationMs: elapsedMs,
          ip:
            req.ip ||
            req.headers?.['x-forwarded-for'] ||
            req.socket?.remoteAddress ||
            'unknown',
          userAgent: req.headers?.['user-agent'] ?? '',
        }),
      );
    });
    next();
  });
  const trustProxy =
    (process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false'))
      .toLowerCase()
      .trim() === 'true';
  if (trustProxy) {
    const server = app.getHttpAdapter().getInstance() as any;
    if (typeof server.set === 'function') {
      server.set('trust proxy', 1);
    }
  }
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  const webOriginEnv = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const allowedOrigins = webOriginEnv
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          message: 'Doğrulama hatası',
          errors: errors.flatMap((error) => mapValidationError(error)),
        }),
    }),
  );

  const prisma = app.get(PrismaService);
  const auth = app.get(AuthService);
  const hasCaptain = await prisma.teamMember.count({
    where: { role: 'CAPTAIN', active: true },
  });
  if (hasCaptain === 0) {
    const email = process.env.BOOTSTRAP_CAPTAIN_EMAIL ?? 'ecceem.3566@gmail.com';
    const password = process.env.BOOTSTRAP_CAPTAIN_PASSWORD ?? '123456';
    await prisma.teamMember.upsert({
      where: { email: email.toLowerCase() },
      update: {
        name: 'Ece MUTLUER',
        role: 'CAPTAIN',
        active: true,
        passwordHash: await auth.hashPassword(password),
      },
      create: {
        name: 'Ece MUTLUER',
        email: email.toLowerCase(),
        role: 'CAPTAIN',
        active: true,
        passwordHash: await auth.hashPassword(password),
      },
    });
    // eslint-disable-next-line no-console
    console.log(`Başlangıç kaptanı hazır: ${email} / ${password}`);
  }

  await prisma.project.upsert({
    where: { key: 'ULGEN-SYSTEM' },
    update: {},
    create: {
      key: 'ULGEN-SYSTEM',
      name: 'Ülgen AR-GE Görev Merkezi',
      description:
        'Takım görevleri ve teslimleri için sistem tarafından yönetilen varsayılan proje',
    },
  });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API şu adreste çalışıyor: http://localhost:${port}`);
}

bootstrap();
