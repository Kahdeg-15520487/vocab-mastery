import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.word.count();
  console.log('Total words in DB:', total);

  const sample = await prisma.word.findFirst({ where: { word: 'abandon' } });
  console.log('Sample word:', JSON.stringify(sample, null, 2));

  const emptyDef = await prisma.word.count({ where: { definition: '' } });
  console.log('Words with empty definition:', emptyDef);

  const withPhonUs = await prisma.word.count({ where: { phoneticUs: { not: '' } } });
  console.log('Words with phoneticUs:', withPhonUs);

  const withPhonUk = await prisma.word.count({ where: { phoneticUk: { not: '' } } });
  console.log('Words with phoneticUk:', withPhonUk);

  const oxfordCounts = await prisma.word.groupBy({ by: ['oxfordList'], _count: true });
  console.log('By Oxford list:', JSON.stringify(oxfordCounts));

  // Check if audioFile fields exist
  const sample2 = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'words' ORDER BY ordinal_position`;
  console.log('Word table columns:', sample2.map((r: any) => r.column_name));

  await prisma.$disconnect();
}

main().catch(console.error);
