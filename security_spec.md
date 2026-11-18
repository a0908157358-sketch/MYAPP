# Security Specification — Couple Sanctuary Firestore Rules

## 1. Data Invariants
1. **Strict Two-Partner Whitelist**: Only authenticated Google users with `email_verified == true` whose lowercase email matches either the hardcoded/synced partner whitelist (`a0908157358@gmail.com` or configured partner email in `coupleSpace/main`) may read or write any document.
2. **Owner-Only Chalkboard Mutation**: Each partner may read both chalkboards, but `chalkboards/{boardId}` can only be created or updated when `boardId == request.auth.uid` and `ownerUid == request.auth.uid`.
3. **Immutable Audit & Ownership Fields**: `createdAt`, `creatorUid`, `senderUid`, `ownerUid`, and `id` cannot be modified after document creation.
4. **Server Timestamp Integrity**: `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
5. **Terminal Voucher Locking**: Once a voucher's `status` becomes `'redeemed'`, no further updates are permitted (preventing re-redemption or tampering with `redeemedAt`).
6. **Time Capsule Lock Enforcement**: A `capsules/{capsuleId}` document cannot be updated to `opened: true` until `request.time.toMillis() >= existing().unlockAtMs`.
7. **Zero Query Trust (`allow list`)**: Every `allow list` rule evaluates `request.auth.token.email_verified == true && request.auth.token.email.lower() in resource.data.allowedEmails` directly against `resource.data` without `get()` or `exists()`.

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated read on `/coupleSpace/main` (`request.auth == null`).
2. Authenticated user with unverified email (`email_verified == false`) attempting write to `/wishlist/item1`.
3. Authenticated third-party user (`stranger@gmail.com`) attempting `get` or `list` on `/vouchers`.
4. Shadow field injection on `/wishlist/item1` create (adding `{ isAdmin: true }`).
5. Identity spoofing on `/chalkboards/{otherUid}` create/update where `boardId != request.auth.uid`.
6. Overwriting `creatorUid` on `/vouchers/{id}` update.
7. Mutating a voucher after `status == 'redeemed'`.
8. Early opening of a Time Capsule (`opened: true`) when `request.time.toMillis() < unlockAtMs`.
9. Injecting an oversized (>128 chars) or invalid-character document ID (`../hack`).
10. Client-forged `createdAt` or `updatedAt` timestamp not equal to `request.time`.
11. Resource poisoning with a >500KB `photoDataUrl` string in `/polaroids`.
12. Creating `/partners/{otherUid}` profile document for another user's UID.
