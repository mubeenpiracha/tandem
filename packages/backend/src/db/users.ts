import type { PrismaClient, User } from '@prisma/client';

export async function findUserByEmail(prisma: PrismaClient, email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

export async function findUserById(prisma: PrismaClient, id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function findUserByGoogleId(
  prisma: PrismaClient,
  googleId: string,
): Promise<User | null> {
  return prisma.user.findUnique({ where: { google_id: googleId } });
}

export async function createEmailUser(
  prisma: PrismaClient,
  data: { email: string; passwordHash: string; displayName: string },
): Promise<User> {
  return prisma.user.create({
    data: {
      email: data.email,
      password_hash: data.passwordHash,
      display_name: data.displayName,
      email_verified: false,
    },
  });
}

export async function createGoogleUser(
  prisma: PrismaClient,
  data: { email: string; googleId: string; displayName: string },
): Promise<User> {
  return prisma.user.create({
    data: {
      email: data.email,
      google_id: data.googleId,
      display_name: data.displayName,
      email_verified: true,
    },
  });
}

export async function updateUserVerified(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { email_verified: true },
  });
}

export async function updatePasswordHash(
  prisma: PrismaClient,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { password_hash: passwordHash },
  });
}

export async function linkGoogleAccount(
  prisma: PrismaClient,
  userId: string,
  googleId: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { google_id: googleId, email_verified: true },
  });
}
