# Security rotation checklist

**MANUAL EXTERNAL ACTION REQUIRED BEFORE PRODUCTION RELEASE**

- Treat any service-role credential previously exposed to a frontend build as compromised.
- Rotate or revoke it in Supabase before production release.
- Store future admin secrets only in trusted server-side secret storage.
- Never expose service-role credentials through `VITE_*` variables.
- Verify old deployed and browser-cached builds no longer contain privileged code.
- Verify Electron and PWA release artifacts no longer contain privileged code.
- Verify the deployed production products/categories RLS policy definitions match
  the D2 migration before release; source-controlled local migrations cannot
  prove the state of an already-deployed project.
- Verify deployed `storage.objects` policies leave public reads for legacy
  product URLs intact while allowing INSERT/DELETE only below the authenticated
  user's `product-images/{userId}/...` prefix. Perform a real authenticated
  upload/delete acceptance check in the production-like release environment.
