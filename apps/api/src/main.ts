import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ValidationError } from 'class-validator';
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
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  app.enableCors({
    origin: webOrigin,
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
    const email = process.env.BOOTSTRAP_CAPTAIN_EMAIL ?? 'captain@ulgen.local';
    const password = process.env.BOOTSTRAP_CAPTAIN_PASSWORD ?? '1234';
    await prisma.teamMember.upsert({
      where: { email: email.toLowerCase() },
      update: {
        role: 'CAPTAIN',
        active: true,
        passwordHash: auth.hashPassword(password),
      },
      create: {
        name: 'Varsayılan Kaptan',
        email: email.toLowerCase(),
        role: 'CAPTAIN',
        active: true,
        passwordHash: auth.hashPassword(password),
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
