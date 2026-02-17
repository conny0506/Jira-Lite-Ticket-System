import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
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
        name: 'Default Captain',
        email: email.toLowerCase(),
        role: 'CAPTAIN',
        active: true,
        passwordHash: auth.hashPassword(password),
      },
    });
    // eslint-disable-next-line no-console
    console.log(`Bootstrap captain ready: ${email} / ${password}`);
  }

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API running on http://localhost:${port}`);
}

bootstrap();
