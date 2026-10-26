# Security Specification — App and Game Playground (Payments & Publisher Questionnaire)

## 1. Data Invariants

1. **Master Gate & Relational Integrity**:
   - Every review document in `/apps/{appId}/reviews/{reviewId}` must belong to an existing parent `/apps/{appId}` document (`exists(/databases/$(database)/documents/apps/$(appId))`) and its `appId` field must match `{appId}`.
   - Every `/publisherQuestionnaires/{questionnaireId}` document requires `incoming().authorId == request.auth.uid`, `acceptedPublisherTerms == true`, and `testedOfflineAndSandbox == true`.
   - Every `/payments/{paymentId}` document requires `incoming().buyerId == request.auth.uid`, `amountCents >= 100 && amountCents <= 99999`, `creatorNetCents + platformFeeCents == amountCents`, and `status == 'succeeded'`. Payments are immutable once recorded (terminal state locking).
2. **Identity & Verified Email Enforcement**:
   - All write operations require an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`) or bootstrapped admin privileges (`redwinemegan61@gmail.com` with `email_verified == true`).
3. **Strict Schema & Volumetric Boundaries**:
   - Every string field enforces strict `minLength` and `maxLength` bounds matching `firebase-blueprint.json`.
   - Document IDs (`{appId}`, `{reviewId}`, `{questionnaireId}`, `{paymentId}`) match `^[a-zA-Z0-9_\-]+$` and are `<= 128` characters.
4. **Query Enforcer (No Blanket Reads)**:
   - `/publisherQuestionnaires` list/get is restricted to the questionnaire owner (`resource.data.authorId == request.auth.uid`) or admin.
   - `/payments` list/get is restricted to the buyer (`resource.data.buyerId == request.auth.uid`), the recipient creator (`resource.data.recipientAuthorId == request.auth.uid`), or admin.

## 2. The "Dirty Dozen" Payloads

1. **Shadow Field Injection**: Creating an app or payment with an undeclared field `{"adminBypass": true}` -> Rejected by `data.keys().hasOnly(...)`.
2. **Identity Spoofing on Create**: Creating an app, questionnaire, or payment where `authorId` / `buyerId` is set to another user's UID -> Rejected by `incoming().authorId == request.auth.uid` / `incoming().buyerId == request.auth.uid`.
3. **Unverified Email Spoof**: Attempting to write with `email_verified == false` -> Rejected by `isVerifiedUser()`.
4. **ID Poisoning Attack**: Creating a document with a 500-character or special-character document ID -> Rejected by `isValidId(...)`.
5. **Denial of Wallet (Oversized String)**: Submitting a `description` of 50,000 characters -> Rejected by `data.description.size() <= 1500`.
6. **Negative or Excessive Price**: Publishing an app with `priceCents: -500` or `priceCents: 9999999` -> Rejected by `data.priceCents >= 0 && data.priceCents <= 99999`.
7. **Unaccepted Publisher Terms**: Submitting a `PublisherQuestionnaire` with `acceptedPublisherTerms: false` -> Rejected by `data.acceptedPublisherTerms == true`.
8. **Fee Split Tampering in Payment**: Submitting a `PaymentTransaction` where `creatorNetCents + platformFeeCents != amountCents` -> Rejected by `data.creatorNetCents + data.platformFeeCents == data.amountCents`.
9. **Terminal Payment Mutation**: Attempting to update or delete a completed `/payments/{paymentId}` record -> Rejected by `allow update, delete: if false;`.
10. **Unauthorized Payment Scraping**: Attempting `allow list` on `/payments` without filtering by `buyerId == request.auth.uid` or `recipientAuthorId == request.auth.uid` -> Rejected by `existing().buyerId == request.auth.uid || existing().recipientAuthorId == request.auth.uid`.
11. **Orphaned Review Creation**: Creating a review under `/apps/non_existent_app/reviews/rev_1` -> Rejected by `exists(/databases/$(database)/documents/apps/$(appId))`.
12. **Invalid Card Last4 Pattern**: Submitting `cardLast4: "ABCD"` -> Rejected by `data.cardLast4.matches('^[0-9]{4}$')`.
