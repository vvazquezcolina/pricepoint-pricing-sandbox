'use client';

import { useState } from 'react';
import type { RoomSummary, SuggestPriceOutput } from '@/lib/types';

interface Props {
  rooms: RoomSummary[];
}

export default function PriceDashboard({ rooms }: Props) {
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id ?? '');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [contextNote, setContextNote] = useState('');
  const [occupancyHint, setOccupancyHint] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SuggestPriceOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  async function onSuggest() {
    setError(null);
    setResult(null);
    setDemoMessage(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = { roomId: selectedRoomId, date };
      if (contextNote) body.contextNote = contextNote;
      if (occupancyHint !== '') {
        const num = Number(occupancyHint);
        if (Number.isFinite(num)) body.occupancyHint = num;
      }
      const res = await fetch('/api/suggest-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.mode === 'demo') {
          setDemoMessage(json.detail ?? json.error);
        } else {
          setError(json.error ?? `HTTP ${res.status}`);
        }
      } else {
        setResult(json as SuggestPriceOutput);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  if (rooms.length === 0) {
    return (
      <div className="rounded border border-line bg-yellow-50 p-4 text-sm">
        No rooms in the database. Run <code>npm run seed</code> to load demo
        data.
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section>
        <h2 className="text-lg font-semibold mb-3">Rooms</h2>
        <ul className="space-y-2">
          {rooms.map((r) => (
            <li
              key={r.id}
              onClick={() => setSelectedRoomId(r.id)}
              className={`cursor-pointer rounded border p-4 transition ${
                r.id === selectedRoomId
                  ? 'border-accent bg-accent/5'
                  : 'border-line hover:border-muted'
              }`}
            >
              <div className="flex justify-between">
                <span className="font-semibold">{r.name}</span>
                <span className="text-sm text-muted">{r.category}</span>
              </div>
              <div className="mt-1 text-sm text-muted">
                Base ${r.basePrice} · Current ${r.currentPrice} · Sleeps{' '}
                {r.capacity}
              </div>
              {r.description && (
                <p className="mt-2 text-xs text-muted">{r.description}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Ask AI for a price</h2>
        {selectedRoom && (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block w-full rounded border border-line p-2"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">
                Occupancy hint (optional, 0.0–1.0)
              </span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={occupancyHint}
                onChange={(e) => setOccupancyHint(e.target.value)}
                placeholder="leave empty to use seeded signal"
                className="mt-1 block w-full rounded border border-line p-2"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">
                Context note (optional)
              </span>
              <textarea
                value={contextNote}
                onChange={(e) => setContextNote(e.target.value)}
                placeholder="e.g., F1 weekend, hurricane warning, cancellation wave"
                rows={2}
                className="mt-1 block w-full rounded border border-line p-2"
              />
            </label>

            <button
              onClick={onSuggest}
              disabled={loading}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? 'Thinking…' : 'Suggest price'}
            </button>

            {error && (
              <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {demoMessage && (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 whitespace-pre-line">
                <strong className="block mb-1">Demo mode</strong>
                {demoMessage}
              </div>
            )}

            {result && (
              <div className="rounded border border-line p-4 space-y-2 text-sm">
                <div className="flex justify-between items-baseline">
                  <span className="text-muted">Suggested price</span>
                  <span className="text-2xl font-bold text-accent">
                    ${result.suggestedPrice.toFixed(2)}
                  </span>
                </div>
                <p className="text-muted leading-relaxed">{result.reasoning}</p>
                <div className="text-xs text-muted border-t border-line pt-2">
                  Model: <code>{result.modelUsed}</code> · Cache hit:{' '}
                  <code>{result.cacheHit ? 'yes' : 'no'}</code> · Tokens:{' '}
                  {result.tokensIn} in / {result.tokensOut} out
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
