import { describe, it, expect, vi } from 'vitest';
import { updateHotScore, castVote } from './hot-score';

function makeD1Result(results: Record<string, unknown>[] = []): D1Result {
  return { results, success: true, meta: {} as D1Meta & Record<string, unknown> } as D1Result;
}

function makeStmt(firstValue: unknown = null, runResult = makeD1Result()) {
  return {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(firstValue),
    run: vi.fn().mockResolvedValue(runResult),
    all: vi.fn().mockResolvedValue(makeD1Result()),
    raw: vi.fn().mockResolvedValue([]),
  };
}

function makeDb(stmtOverride?: ReturnType<typeof makeStmt>) {
  const stmt = stmtOverride ?? makeStmt();
  return {
    prepare: vi.fn().mockReturnValue(stmt),
    batch: vi.fn().mockResolvedValue([]),
    exec: vi.fn(),
    dump: vi.fn(),
  } as unknown as D1Database;
}

describe('updateHotScore', () => {
  it('sets vote_count=0 and score based on epoch when no votes', async () => {
    const stats = { count: 0, first_voted: null };
    const usersStmt = makeStmt(stats);
    const usersDb = makeDb(usersStmt);

    const recipesStmt = makeStmt();
    const recipesDb = makeDb(recipesStmt);

    await updateHotScore(usersDb, recipesDb, 'recipe-1', 90000, 1704067200);

    expect(recipesDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE recipes'),
    );
    const bindCall = recipesStmt.bind.mock.calls[0]!;
    expect(bindCall[0]).toBe(0); // votes
    expect(typeof bindCall[1]).toBe('number'); // score
    expect(bindCall[3]).toBe('recipe-1');
  });

  it('computes log10 formula correctly', async () => {
    const firstVoted = '2024-01-01T01:00:00Z';
    const stats = { count: 10, first_voted: firstVoted };
    const usersStmt = makeStmt(stats);
    const usersDb = makeDb(usersStmt);

    const recipesStmt = makeStmt();
    const recipesDb = makeDb(recipesStmt);

    await updateHotScore(usersDb, recipesDb, 'recipe-1', 90000, 1704067200);

    const bindCall = recipesStmt.bind.mock.calls[0]!;
    const score = bindCall[1] as number;
    const expectedEpochSecs = new Date(firstVoted).getTime() / 1000;
    const expectedScore = Math.log10(10) + (expectedEpochSecs - 1704067200) / 90000;
    expect(score).toBeCloseTo(expectedScore, 5);
  });
});

describe('castVote', () => {
  it('inserts vote and refreshes hot score', async () => {
    const stats = { count: 1, first_voted: '2024-01-01T00:00:00Z' };
    const usersInsertStmt = makeStmt(null);
    const usersStatsStmt = makeStmt(stats);

    let usersCallCount = 0;
    const usersDb = {
      prepare: vi.fn().mockImplementation(() => {
        usersCallCount++;
        if (usersCallCount === 1) return usersInsertStmt; // INSERT
        return usersStatsStmt; // SELECT stats
      }),
      batch: vi.fn(),
      exec: vi.fn(),
      dump: vi.fn(),
    } as unknown as D1Database;

    const voteCountRow = { vote_count: 1 };
    const recipesUpdateStmt = makeStmt();
    const recipesSelectStmt = makeStmt(voteCountRow);

    let recipesCallCount = 0;
    const recipesDb = {
      prepare: vi.fn().mockImplementation(() => {
        recipesCallCount++;
        if (recipesCallCount === 1) return recipesUpdateStmt; // UPDATE
        return recipesSelectStmt; // SELECT vote_count
      }),
      batch: vi.fn(),
      exec: vi.fn(),
      dump: vi.fn(),
    } as unknown as D1Database;

    const count = await castVote(usersDb, recipesDb, 'user-1', 'recipe-1', 'heart', 1.0);
    expect(count).toBe(1);
    expect(usersInsertStmt.run).toHaveBeenCalled();
  });
});
