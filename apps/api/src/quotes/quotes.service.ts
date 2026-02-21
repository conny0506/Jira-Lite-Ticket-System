import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  async getRandom() {
    const total = await this.prisma.motivationalQuote.count({
      where: { isActive: true },
    });

    if (total < 1) {
      return { quote: null };
    }

    const randomOffset = Math.floor(Math.random() * total);
    const quote = await this.prisma.motivationalQuote.findFirst({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      skip: randomOffset,
      take: 1,
      select: {
        id: true,
        text: true,
      },
    });

    return { quote };
  }
}
