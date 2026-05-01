import PriceDashboard from '@/components/PriceDashboard';
import { prisma } from '@/lib/db';
import type { RoomSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const rooms = await prisma.room.findMany({ orderBy: { basePrice: 'asc' } });
  const summaries: RoomSummary[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    basePrice: r.basePrice,
    currentPrice: r.currentPrice,
    capacity: r.capacity,
    description: r.description,
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 border-b border-line pb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Pricepoint Pricing Sandbox
        </h1>
        <p className="mt-2 text-sm text-muted max-w-2xl">
          AI-driven hotel-pricing demo. Pick a room, set a date, and ask Claude
          to suggest a price. The model sees base price, current price,
          occupancy signal and any context note you add. Source on{' '}
          <a
            className="text-accent underline"
            href="https://github.com/vvazquezcolina/pricepoint-pricing-sandbox"
          >
            GitHub
          </a>
          .
        </p>
      </header>

      <PriceDashboard rooms={summaries} />

      <footer className="mt-16 border-t border-line pt-6 text-xs text-muted">
        Built by{' '}
        <a
          className="text-accent"
          href="https://github.com/vvazquezcolina"
        >
          Victor Vazquez
        </a>
        . AI-agent-driven engineering portfolio piece — see{' '}
        <a
          className="text-accent"
          href="https://github.com/vvazquezcolina/ai-agent-workflows"
        >
          ai-agent-workflows
        </a>{' '}
        for the methodology.
      </footer>
    </main>
  );
}
