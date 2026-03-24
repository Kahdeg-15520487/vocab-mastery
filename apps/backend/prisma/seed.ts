import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Sample word data
const sampleWords = [
  {
    word: 'algorithm',
    phoneticUs: '/ˈælɡərɪðəm/',
    phoneticUk: '/ˈælɡərɪðəm/',
    partOfSpeech: ['noun'],
    definition: 'A process or set of rules to be followed in calculations or other problem-solving operations, especially by a computer.',
    examples: ['The search algorithm helps find results quickly.', 'We need to optimize the algorithm for better performance.'],
    synonyms: ['method', 'procedure', 'formula', 'technique'],
    antonyms: [],
    oxfordList: '5000',
    cefrLevel: 'B2',
    frequency: 2500,
    themes: ['technology'],
  },
  {
    word: 'innovation',
    phoneticUs: '/ˌɪnəˈveɪʃn/',
    phoneticUk: '/ˌɪnəˈveɪʃn/',
    partOfSpeech: ['noun'],
    definition: 'The action or process of innovating; a new method, idea, product, etc.',
    examples: ['The company is known for its innovation in technology.', 'Innovation drives economic growth.'],
    synonyms: ['invention', 'creation', 'novelty', 'breakthrough'],
    antonyms: ['stagnation', 'tradition'],
    oxfordList: '3000',
    cefrLevel: 'B2',
    frequency: 1800,
    themes: ['business', 'technology'],
  },
  {
    word: 'sustainable',
    phoneticUs: '/səˈsteɪnəbl/',
    phoneticUk: '/səˈsteɪnəbl/',
    partOfSpeech: ['adjective'],
    definition: 'Able to be maintained at a certain rate or level; not harmful to the environment.',
    examples: ['We need to develop sustainable energy sources.', 'Sustainable farming practices protect the environment.'],
    synonyms: ['renewable', 'eco-friendly', 'viable', 'maintainable'],
    antonyms: ['unsustainable', 'harmful'],
    oxfordList: '3000',
    cefrLevel: 'B1',
    frequency: 1500,
    themes: ['environment', 'business'],
  },
  {
    word: 'collaborate',
    phoneticUs: '/kəˈlæbəreɪt/',
    phoneticUk: '/kəˈlæbəreɪt/',
    partOfSpeech: ['verb'],
    definition: 'To work jointly on an activity or project.',
    examples: ['The two companies decided to collaborate on the project.', 'Scientists collaborate across borders to solve global problems.'],
    synonyms: ['cooperate', 'work together', 'partner', 'team up'],
    antonyms: ['compete', 'work alone'],
    oxfordList: '3000',
    cefrLevel: 'B1',
    frequency: 2000,
    themes: ['business', 'education'],
  },
  {
    word: 'hypothesis',
    phoneticUs: '/haɪˈpɒθəsɪs/',
    phoneticUk: '/haɪˈpɒθəsɪs/',
    partOfSpeech: ['noun'],
    definition: 'A supposition or proposed explanation made on the basis of limited evidence as a starting point for further investigation.',
    examples: ['The scientist tested her hypothesis through experiments.', 'We need more data to support this hypothesis.'],
    synonyms: ['theory', 'proposition', 'assumption', 'conjecture'],
    antonyms: ['fact', 'proof'],
    oxfordList: '5000',
    cefrLevel: 'C1',
    frequency: 3200,
    themes: ['science', 'education'],
  },
  {
    word: 'globalization',
    phoneticUs: '/ˌɡloʊbələˈzeɪʃn/',
    phoneticUk: '/ˌɡləʊbəlaɪˈzeɪʃn/',
    partOfSpeech: ['noun'],
    definition: 'The process by which businesses or other organizations develop international influence or start operating on an international scale.',
    examples: ['Globalization has changed the way companies do business.', 'The effects of globalization can be seen in every industry.'],
    synonyms: ['internationalization', 'global integration'],
    antonyms: ['localization', 'protectionism'],
    oxfordList: '5000',
    cefrLevel: 'B2',
    frequency: 2800,
    themes: ['business', 'society'],
  },
  {
    word: 'nutrition',
    phoneticUs: '/nuˈtrɪʃn/',
    phoneticUk: '/njuˈtrɪʃn/',
    partOfSpeech: ['noun'],
    definition: 'The process of providing or obtaining the food necessary for health and growth.',
    examples: ['Good nutrition is essential for children\'s development.', 'The nutrition label shows the amount of vitamins and minerals.'],
    synonyms: ['nourishment', 'diet', 'sustenance'],
    antonyms: ['malnutrition'],
    oxfordList: '3000',
    cefrLevel: 'B1',
    frequency: 2100,
    themes: ['health', 'food'],
  },
  {
    word: 'infrastructure',
    phoneticUs: '/ˈɪnfrəstrʌktʃər/',
    phoneticUk: '/ˈɪnfrəstrʌktʃə/',
    partOfSpeech: ['noun'],
    definition: 'The basic physical and organizational structures and facilities needed for the operation of a society or enterprise.',
    examples: ['The government is investing in infrastructure projects.', 'Digital infrastructure is crucial for modern businesses.'],
    synonyms: ['facilities', 'structure', 'foundation', 'framework'],
    antonyms: [],
    oxfordList: '5000',
    cefrLevel: 'B2',
    frequency: 2600,
    themes: ['business', 'technology', 'society'],
  },
  {
    word: 'diversity',
    phoneticUs: '/dɪˈvɜːrsəti/',
    phoneticUk: '/daɪˈvɜːsəti/',
    partOfSpeech: ['noun'],
    definition: 'The state of being diverse; variety; a range of different things.',
    examples: ['The company values diversity in its workforce.', 'Biodiversity is essential for ecosystem health.'],
    synonyms: ['variety', 'range', 'mixture', 'difference'],
    antonyms: ['uniformity', 'sameness'],
    oxfordList: '3000',
    cefrLevel: 'B1',
    frequency: 1900,
    themes: ['business', 'society', 'environment'],
  },
  {
    word: 'comprehensive',
    phoneticUs: '/ˌkɑːmprɪˈhensɪv/',
    phoneticUk: '/ˌkɒmprɪˈhensɪv/',
    partOfSpeech: ['adjective'],
    definition: 'Complete and including everything that is necessary.',
    examples: ['We need a comprehensive plan to address the issue.', 'The report provides a comprehensive analysis of the market.'],
    synonyms: ['complete', 'thorough', 'extensive', 'all-inclusive'],
    antonyms: ['incomplete', 'partial', 'limited'],
    oxfordList: '3000',
    cefrLevel: 'B2',
    frequency: 2200,
    themes: ['business', 'education'],
  },
  {
    word: 'empathy',
    phoneticUs: '/ˈempəθi/',
    phoneticUk: '/ˈempəθi/',
    partOfSpeech: ['noun'],
    definition: 'The ability to understand and share the feelings of another.',
    examples: ['She showed great empathy toward the patients.', 'Empathy is an important skill for leaders.'],
    synonyms: ['understanding', 'compassion', 'sensitivity'],
    antonyms: ['apathy', 'indifference'],
    oxfordList: '5000',
    cefrLevel: 'B2',
    frequency: 2400,
    themes: ['society', 'health'],
  },
  {
    word: 'authentication',
    phoneticUs: '/ɔːˌθentɪˈkeɪʃn/',
    phoneticUk: '/ɔːˌθentɪˈkeɪʃn/',
    partOfSpeech: ['noun'],
    definition: 'The process or action of verifying the identity of a user or process.',
    examples: ['Two-factor authentication adds an extra layer of security.', 'The system requires authentication before granting access.'],
    synonyms: ['verification', 'validation', 'identification'],
    antonyms: [],
    oxfordList: '5000',
    cefrLevel: 'C1',
    frequency: 3500,
    themes: ['technology'],
  },
  {
    word: 'resilient',
    phoneticUs: '/rɪˈzɪliənt/',
    phoneticUk: '/rɪˈzɪliənt/',
    partOfSpeech: ['adjective'],
    definition: 'Able to withstand or recover quickly from difficult conditions.',
    examples: ['Children are often more resilient than adults.', 'The resilient economy bounced back quickly.'],
    synonyms: ['strong', 'tough', 'adaptable', 'flexible'],
    antonyms: ['fragile', 'weak'],
    oxfordList: '5000',
    cefrLevel: 'B2',
    frequency: 2700,
    themes: ['health', 'business', 'society'],
  },
  {
    word: 'ecosystem',
    phoneticUs: '/ˈiːkoʊsɪstəm/',
    phoneticUk: '/ˈiːkəʊsɪstəm/',
    partOfSpeech: ['noun'],
    definition: 'A biological community of interacting organisms and their physical environment.',
    examples: ['The coral reef is a delicate ecosystem.', 'Technology companies form their own business ecosystem.'],
    synonyms: ['environment', 'habitat', 'system'],
    antonyms: [],
    oxfordList: '5000',
    cefrLevel: 'B2',
    frequency: 2300,
    themes: ['environment', 'technology'],
  },
  {
    word: 'methodology',
    phoneticUs: '/ˌmeθəˈdɑːlədʒi/',
    phoneticUk: '/ˌmeθəˈdɒlədʒi/',
    partOfSpeech: ['noun'],
    definition: 'A system of methods used in a particular area of study or activity.',
    examples: ['The research methodology was clearly explained.', 'We need to improve our development methodology.'],
    synonyms: ['method', 'approach', 'system', 'framework'],
    antonyms: [],
    oxfordList: '5000',
    cefrLevel: 'C1',
    frequency: 3400,
    themes: ['science', 'education', 'business'],
  },
];

const themes = [
  { name: 'Technology', slug: 'technology', icon: '💻', description: 'Words related to computers, software, and digital technology' },
  { name: 'Business', slug: 'business', icon: '💼', description: 'Professional and business-related vocabulary' },
  { name: 'Environment', slug: 'environment', icon: '🌿', description: 'Environmental and sustainability terms' },
  { name: 'Health & Medicine', slug: 'health', icon: '🏥', description: 'Medical and health-related vocabulary' },
  { name: 'Science', slug: 'science', icon: '🔬', description: 'Scientific terms and research vocabulary' },
  { name: 'Education', slug: 'education', icon: '📚', description: 'Academic and educational terms' },
  { name: 'Food & Cooking', slug: 'food', icon: '🍳', description: 'Culinary and nutrition vocabulary' },
  { name: 'Society & Culture', slug: 'society', icon: '🌍', description: 'Social and cultural terms' },
];

async function main() {
  console.log('Seeding database...');

  // Create themes
  console.log('Creating themes...');
  for (const theme of themes) {
    await prisma.theme.upsert({
      where: { slug: theme.slug },
      update: theme,
      create: theme,
    });
  }

  // Create words
  console.log('Creating words...');
  for (const wordData of sampleWords) {
    const { themes: wordThemes, ...word } = wordData;

    const createdWord = await prisma.word.upsert({
      where: { word: word.word },
      update: {
        ...word,
        partOfSpeech: word.partOfSpeech,
        examples: word.examples,
        synonyms: word.synonyms,
        antonyms: word.antonyms,
      },
      create: {
        ...word,
        partOfSpeech: word.partOfSpeech,
        examples: word.examples,
        synonyms: word.synonyms,
        antonyms: word.antonyms,
      },
    });

    // Link themes
    for (const themeSlug of wordThemes) {
      const theme = await prisma.theme.findUnique({ where: { slug: themeSlug } });
      if (theme) {
        await prisma.wordTheme.upsert({
          where: {
            wordId_themeId: { wordId: createdWord.id, themeId: theme.id },
          },
          update: {},
          create: { wordId: createdWord.id, themeId: theme.id },
        });
      }
    }
  }

  // Create initial user stats
  console.log('Creating user stats...');
  await prisma.userStats.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      totalWords: 0,
      masteredWords: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalXP: 0,
      level: 1,
    },
  });

  console.log('Seeding completed!');
  console.log(`Created ${themes.length} themes`);
  console.log(`Created ${sampleWords.length} words`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
