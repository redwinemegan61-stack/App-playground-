# Security Specification — App and Game Playground

## 1. Data Invariants

1. **Master Gate & Relational Integrity**:
   - Every review document in `/apps/{appId}/reviews/{reviewId}` must belong to an existing parent `/apps/{appId}` document (`exists(/databases/$(database)/documents/apps/$(appId))`) and its `appId` field must match the `{appId}` path variable.
2. **Identity & Verified Email Enforcement**:
   - All write operations require an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`) or bootstrapped admin privileges (`redwinemegan61@gmail.com` with `email_verified == true`).
   - On creation of `/apps/{appId}` or `/apps/{appId}/reviews/{reviewId}`, `incoming().authorId == request.auth.uid`.
3. **Strict Schema & Volumetric Boundaries**:
   - Every string field enforces strict `minLength` and `maxLength` bounds matching `firebase-blueprint.json`.
   - Document IDs (`{appId}`, `{reviewId}`) match `^[a-zA-Z0-9_\-]+$` and are `<= 128` characters.
4. **Temporal & Immutable Fields**:
   - `createdAt` must equal `request.time` on creation and remain immutable on update.
   - `updatedAt` must equal `request.time` on both creation and update.
   - `authorId` is immutable across all updates.

## 2. The "Dirty Dozen" Payloads

1. **Shadow Field Injection**: Creating an app with an undeclared field `{"isFeaturedAdmin": true}` -> Rejected by `data.keys().hasOnly(...)`.
2. **Identity Spoofing on Create**: Creating an app where `authorId` is set to another user's UID -> Rejected by `data.authorId == request.auth.uid`.
3. **Unverified Email Spoof**: Attempting to write with `request.auth.token.email == 'redwinemegan61@gmail.com'` but `email_verified == false` -> Rejected by `isVerifiedUser()`.
4. **ID Poisoning Attack**: Creating a document with a 500-character or special-character document ID -> Rejected by `isValidId(appId)`.
5. **Denial of Wallet (Oversized String)**: Submitting a `description` of 50,000 characters -> Rejected by `data.description.size() <= 1500`.
6. **Invalid Enum Category**: Submitting `category: "MaliciousCategory"` -> Rejected by `data.category in ['Game', 'Creative App', 'Developer Tool', 'Utility', 'Simulation']`.
7. **Timestamp Forgery on Create**: Submitting a client-crafted past/future `createdAt` timestamp -> Rejected by `incoming().createdAt == request.time`.
8. **Author Reassignment on Update**: Attempting to change `authorId` during an update -> Rejected by `incoming().authorId == existing().authorId` and `affectedKeys().hasOnly(...)`.
9. **Arbitrary Counter Jump**: Non-owner attempting to increase `playsCount` by +1000 in a single update -> Rejected by `incoming().playsCount == existing().playsCount + 1`.
10. **Orphaned Review Creation**: Creating a review under `/apps/non_existent_app/reviews/rev_1` -> Rejected by `exists(/databases/$(database)/documents/apps/$(appId))`.
11. **Path Mismatch in Subcollection**: Creating a review under `/apps/app_1/reviews/rev_1` with `data.appId == "app_2"` -> Rejected by `incoming().appId == appId`.
12. **Out-of-Range Rating**: Creating a review with `rating: 99` or `rating: 0` -> Rejected by `data.rating >= 1 && data.rating <= 5`.
