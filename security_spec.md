# Security Specification — Solomon Building Materials Shop

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every financial record (`sales`, `purchases`, `bankAccounts`, `bankTransactions`, `dailyCloses`, `reconcilingItems`, `brsStatements`, `settings`) is strictly owned by a single authenticated, email-verified user (`ownerId == request.auth.uid`).
2. **No Blanket Reads**: `allow list` and `allow get` are strictly conditioned on `resource.data.ownerId == request.auth.uid`.
3. **Immutable Identity & Creation Timestamps**: `ownerId` and `createdAt` cannot be modified after creation (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`).
4. **Server Timestamp Enforcement**: `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
5. **Strict Key & Size Boundaries**: Every string field has a strict maximum length, IDs match `^[a-zA-Z0-9_\-]+$`, and shadow fields are blocked via `hasAll` and `hasOnly`.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null` attempting to create a `sales` document.
2. **Unverified Email Spoof**: `auth = { uid: 'u1', token: { email_verified: false } }` attempting to create a `bankAccounts` document.
3. **Cross-Tenant Identity Spoofing**: `auth.uid = 'u1'` attempting to create a `sales` document with `ownerId: 'u2'`.
4. **Shadow Field Injection (Create)**: Creating a `purchases` document with an extra undeclared field `"isAdmin": true`.
5. **Shadow Field Injection (Update)**: Updating a `bankAccounts` document with an undeclared field `"hacked": 1`.
6. **Owner Hijack on Update**: Updating `ownerId` on an existing `sales` document to another user's UID.
7. **Timestamp Forgery (Past/Future)**: Creating a `dailyCloses` document where `createdAt` does not match `request.time`.
8. **ID Poisoning Attack**: Creating a document with a 300-character ID or special characters outside `^[a-zA-Z0-9_\-]+$`.
9. **Denial-of-Wallet String Overflow**: Sending a 50,000-character `notes` string into `reconcilingItems`.
10. **Blanket List Query Scraping**: Listing `sales` without filtering by `ownerId == request.auth.uid`.
11. **Cross-Tenant Read (`get`)**: User `u2` attempting to read `/settings/u1`.
12. **Cross-Tenant Delete**: User `u2` attempting to delete `/bankAccounts/acc1` owned by `u1`.
