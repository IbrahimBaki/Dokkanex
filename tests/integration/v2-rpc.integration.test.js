import { describe, it } from 'vitest';

// Requires the local-only V2 migration and RPCs planned for Step 3B-B.
// This file defines the CI/test command boundary without claiming that missing
// database behavior currently exists.
describe.skip('local Supabase V2 inventory/RLS integration', () => {
  it('enforces ownership, idempotency, balance integrity, and stock-count conflicts');
});
