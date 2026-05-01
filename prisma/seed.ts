/**
 * Seed script. Populates the demo with three sample rooms and a week of
 * occupancy signal so the AI has real inputs to reason against.
 *
 * Run: npm run seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const rooms = [
  {
    name: 'Ocean View Standard',
    category: 'Standard',
    basePrice: 180,
    currentPrice: 180,
    capacity: 2,
    description: 'King bed, balcony with partial ocean view, 32 m².',
  },
  {
    name: 'Beachfront Suite',
    category: 'Suite',
    basePrice: 340,
    currentPrice: 340,
    capacity: 4,
    description: 'Two bedrooms, kitchenette, direct beach access, 65 m².',
  },
  {
    name: 'Sky Penthouse',
    category: 'Penthouse',
    basePrice: 720,
    currentPrice: 720,
    capacity: 6,
    description: 'Top-floor penthouse, private terrace, hot tub, 140 m².',
  },
];

async function main() {
  console.log('Clearing existing data...');
  await prisma.priceSuggestion.deleteMany();
  await prisma.occupancyEvent.deleteMany();
  await prisma.room.deleteMany();

  console.log('Seeding rooms...');
  const created = [];
  for (const r of rooms) {
    const room = await prisma.room.create({ data: r });
    created.push(room);
  }

  console.log('Seeding occupancy signal (next 7 days)...');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const room of created) {
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = new Date(today);
      date.setDate(today.getDate() + dayOffset);
      const dayOfWeek = date.getDay();
      // weekend bump
      const baseOccupancy = dayOfWeek === 5 || dayOfWeek === 6 ? 0.85 : 0.55;
      // small per-room variance
      const variance = (Math.random() - 0.5) * 0.2;
      const occupancy = Math.max(0, Math.min(1, baseOccupancy + variance));

      await prisma.occupancyEvent.create({
        data: {
          roomId: room.id,
          date,
          occupancy,
          note:
            dayOfWeek === 5 || dayOfWeek === 6
              ? 'Weekend demand'
              : 'Mid-week',
        },
      });
    }
  }

  console.log(`Done. Seeded ${created.length} rooms with 7 days of occupancy each.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
