import { describe, it } from 'vitest';

// These are deliberately skipped specifications. The V2 schema, Dexie stores,
// RPCs, and sync implementation do not exist in Step 3B-A and must not be
// simulated as passing behavior.
describe.skip('V2 inventory foundation (implemented in later Step 3B work)', () => {
  it('migrates existing Dexie v2 records to v3 without data loss');
  it('isolates browser-local data and pending operations by authenticated user');
  it('uses decimal strings without floating-point balance drift');
  it('distinguishes Stock not set from an explicitly initialized zero');
  it('permits a warned negative balance and retries an idempotent movement');
  it('retains an image until its replacement metadata is safely accepted');
});
