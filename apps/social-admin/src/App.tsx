import { SwipeStack } from './SwipeStack';

export const App = () => {
  return (
    <div className="min-h-screen w-full flex flex-col items-center px-4 py-6">
      <header className="w-full max-w-md flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl text-ink">Social drafts</h1>
        <a
          href="/oauth/pinterest/start"
          className="text-caps text-ink-3 hover:text-ink"
        >
          Connect Pinterest
        </a>
      </header>
      <main className="w-full max-w-md flex-1 flex items-start justify-center">
        <SwipeStack />
      </main>
    </div>
  );
};
