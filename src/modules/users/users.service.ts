import { Injectable } from '@nestjs/common';
import type { Role } from '../../common/auth/role.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { UserDto, UserRefDto } from './dto/user.dto.js';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listRefs(role?: Role): Promise<UserRefDto[]> {
    return this.prisma.user.findMany({
      where: { role },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string): Promise<UserDto | null> {
    return this.prisma.user.findUnique({ where: { id }, select: userSelect });
  }

  /** The only read that exposes the password hash. It must never leave AuthService. */
  findWithPasswordHash(email: string): Promise<(UserDto & { passwordHash: string }) | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { ...userSelect, passwordHash: true },
    });
  }
}
