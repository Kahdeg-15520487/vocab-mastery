import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default admin user
  console.log('Creating default admin user...');
  const adminPasswordHash = await bcrypt.hash('admin1234@!', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      id: 'admin-00000000-0000-0000-0000-000000000001',
      email: 'admin@vocab.master',
      username: 'admin',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      subscriptionTier: 'WORDSMITH',
    },
  });
  console.log('Admin user created: admin / admin1234@!');

  // Create initial user streak for admin
  console.log('Creating admin user streak...');
  await prisma.userStreak.upsert({
    where: { userId: 'admin-00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      userId: 'admin-00000000-0000-0000-0000-000000000001',
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: new Date(),
    },
  });

  console.log('Seeding completed!');
  console.log('Note: Dictionary words are auto-imported on server startup via seed-dictionary.ts');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
