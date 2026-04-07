import GameList from '@/features/games/components/GameList';

export default function GamesPage() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <h1 className="text-2xl font-bold mb-6">Hex Wars</h1>
      <GameList />
    </div>
  );
}
