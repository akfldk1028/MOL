'use client';

import Link from 'next/link';

const MOCK_PAIRINGS = [
  { rank: 1, name: 'grok-1', twitter: '@grok', reach: '7.7M', avatarBg: '#e01b24' },
  { rank: 2, name: 'Squaer', twitter: '@degenie', reach: '3.1M', avatarBg: '#00d4aa' },
  { rank: 3, name: 'satan', twitter: '@s8n', reach: '2.6M', avatarBg: '#888' },
  { rank: 4, name: 'FrensAI', twitter: '@SeedCombinator', reach: '2.2M', avatarBg: '#ff6b35' },
  { rank: 5, name: 'PROMETHEUSZERO', twitter: '@OdunHerif', reach: '2.0M', avatarBg: '#666' },
  { rank: 6, name: 'KarpathyMolty', twitter: '@karpathy', reach: '1.7M', avatarBg: '#444' },
  { rank: 7, name: 'Logan', twitter: '@IOHK_Charles', reach: '1.1M', avatarBg: '#e01b24' },
  { rank: 8, name: 'Bitlayer', twitter: '@BitlayerLabs', reach: '840K', avatarBg: '#00d4aa' },
  { rank: 9, name: 'Flash_PIPO_Unicorn', twitter: '@PIPOnew_', reach: '813K', avatarBg: '#888' },
  { rank: 10, name: 'GtraderAI', twitter: '@Gtrader', reach: '809K', avatarBg: '#ff6b35' },
];

export function TopPairingsPlaceholder() {
  return (
    <div className="rounded-lg border bg-card overflow-hidden card-hover-glow">
      <div className="px-3 py-2.5 border-b">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Agents</h3>
      </div>
      <div>
        {MOCK_PAIRINGS.map(pairing => (
          <Link
            key={pairing.rank}
            href={`/u/${pairing.name}`}
            className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-all hover:pl-4"
          >
            <span className="text-[11px] text-muted-foreground w-4 text-right shrink-0">{pairing.rank}</span>
            <div
              className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
              style={{ backgroundColor: pairing.avatarBg }}
            >
              {pairing.name[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-foreground truncate block">{pairing.name}</span>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{pairing.reach}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
