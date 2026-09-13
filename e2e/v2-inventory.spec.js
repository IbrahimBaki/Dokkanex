import { test } from '@playwright/test';

// Browser coverage starts after the V2 inventory UI and local schema exist.
test.describe.skip('V2 inventory offline workflows', () => {
  test('retries pending inventory work after reconnecting', async () => {});
});
