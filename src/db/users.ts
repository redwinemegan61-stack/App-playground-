import { db } from './index.ts';
import {
  users,
  publishedApps,
  publisherQuestionnaires,
  paymentTransactions,
} from './schema.ts';
import { eq, desc } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string, displayName?: string) {
  try {
    const role = email.toLowerCase() === 'redwinemegan61@gmail.com' ? 'admin' : 'creator';
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || email.split('@')[0] || 'Creator',
        role,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName || email.split('@')[0] || 'Creator',
          role,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Failed to synchronize user account. Please try again later.', { cause: error });
  }
}

export async function recordQuestionnaireInSql(
  uid: string,
  email: string,
  payload: {
    questionnaireDocId: string;
    appDocId: string;
    studioName: string;
    supportContact: string;
    ageRating: string;
    contentAdvisory: string;
    violenceLevel: string;
    fearLevel: string;
    languageLevel: string;
    substancesLevel: string;
    gamblingThemes: string;
    userInteraction: string;
    generalSafetyStandards: boolean;
    dataPrivacyPolicy: string;
    accessibilityFeatures: string;
    monetizationModel: string;
    priceCents: number;
    payoutMethod: string;
    stripePaymentLink?: string;
    testedInBrowserSandbox: boolean;
    acceptedPublisherTerms: boolean;
    complianceCertificateId: string;
    reviewStatus: string;
  }
) {
  try {
    await getOrCreateUser(uid, email, payload.studioName);
    const result = await db
      .insert(publisherQuestionnaires)
      .values({
        questionnaireDocId: payload.questionnaireDocId,
        appDocId: payload.appDocId,
        authorUid: uid,
        studioName: payload.studioName,
        supportContact: payload.supportContact,
        ageRating: payload.ageRating,
        contentAdvisory: payload.contentAdvisory,
        violenceLevel: payload.violenceLevel,
        fearLevel: payload.fearLevel,
        languageLevel: payload.languageLevel,
        substancesLevel: payload.substancesLevel,
        gamblingThemes: payload.gamblingThemes,
        userInteraction: payload.userInteraction,
        generalSafetyStandards: payload.generalSafetyStandards,
        dataPrivacyPolicy: payload.dataPrivacyPolicy,
        accessibilityFeatures: payload.accessibilityFeatures,
        monetizationModel: payload.monetizationModel,
        priceCents: payload.priceCents,
        payoutMethod: payload.payoutMethod,
        stripePaymentLink: payload.stripePaymentLink || null,
        testedInBrowserSandbox: payload.testedInBrowserSandbox,
        acceptedPublisherTerms: payload.acceptedPublisherTerms,
        complianceCertificateId: payload.complianceCertificateId,
        reviewStatus: payload.reviewStatus,
      })
      .onConflictDoUpdate({
        target: publisherQuestionnaires.questionnaireDocId,
        set: {
          reviewStatus: payload.reviewStatus,
          ageRating: payload.ageRating,
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database questionnaire insert failed:', error);
    throw new Error('Failed to store publisher questionnaire in database.', { cause: error });
  }
}

export async function recordPublishedAppInSql(
  uid: string,
  email: string,
  payload: {
    appDocId: string;
    authorName: string;
    title: string;
    tagline: string;
    description: string;
    category: string;
    playType: string;
    version: string;
    externalUrl?: string;
    priceCents: number;
    monetizationModel: string;
    ageRating: string;
    contentAdvisory: string;
    violenceLevel: string;
    fearLevel: string;
    languageLevel: string;
    substancesLevel: string;
    gamblingThemes: string;
    userInteraction: string;
    generalSafetyStandards: boolean;
    dataPrivacyPolicy: string;
    accessibilityFeatures: string;
    payoutMethod: string;
    stripePaymentLink?: string;
    complianceCertificateId: string;
    isPublic: boolean;
    reviewStatus: string;
  }
) {
  try {
    await getOrCreateUser(uid, email, payload.authorName);
    const result = await db
      .insert(publishedApps)
      .values({
        appDocId: payload.appDocId,
        authorUid: uid,
        authorName: payload.authorName,
        title: payload.title,
        tagline: payload.tagline,
        description: payload.description,
        category: payload.category,
        playType: payload.playType,
        version: payload.version,
        externalUrl: payload.externalUrl || null,
        priceCents: payload.priceCents,
        monetizationModel: payload.monetizationModel,
        ageRating: payload.ageRating,
        contentAdvisory: payload.contentAdvisory,
        violenceLevel: payload.violenceLevel,
        fearLevel: payload.fearLevel,
        languageLevel: payload.languageLevel,
        substancesLevel: payload.substancesLevel,
        gamblingThemes: payload.gamblingThemes,
        userInteraction: payload.userInteraction,
        generalSafetyStandards: payload.generalSafetyStandards,
        dataPrivacyPolicy: payload.dataPrivacyPolicy,
        accessibilityFeatures: payload.accessibilityFeatures,
        payoutMethod: payload.payoutMethod,
        stripePaymentLink: payload.stripePaymentLink || null,
        complianceCertificateId: payload.complianceCertificateId,
        isPublic: payload.isPublic,
        reviewStatus: payload.reviewStatus,
      })
      .onConflictDoUpdate({
        target: publishedApps.appDocId,
        set: {
          isPublic: payload.isPublic,
          reviewStatus: payload.reviewStatus,
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database app insert failed:', error);
    throw new Error('Failed to store published app in database.', { cause: error });
  }
}

export async function updateReviewStatusInSql(
  questionnaireDocId: string,
  appDocId: string,
  decision: 'approved' | 'denied',
  adminReviewNotes: string
) {
  try {
    await db
      .update(publisherQuestionnaires)
      .set({
        reviewStatus: decision,
        adminReviewNotes,
      })
      .where(eq(publisherQuestionnaires.questionnaireDocId, questionnaireDocId));

    if (appDocId && appDocId !== 'standalone-questionnaire') {
      await db
        .update(publishedApps)
        .set({
          reviewStatus: decision,
          isPublic: decision === 'approved',
          adminReviewNotes,
        })
        .where(eq(publishedApps.appDocId, appDocId));
    }
    return { updated: true };
  } catch (error) {
    console.error('Database review decision update failed:', error);
    throw new Error('Failed to update review decision in database.', { cause: error });
  }
}

export async function recordPaymentInSql(
  uid: string,
  email: string,
  payload: {
    receiptNumber: string;
    intentId: string;
    appDocId: string;
    appTitle: string;
    recipientAuthorId: string;
    buyerName: string;
    amountCents: number;
    creatorNetCents: number;
    platformFeeCents: number;
    currency: string;
    paymentType: string;
    cardBrand: string;
    cardLast4: string;
  }
) {
  try {
    await getOrCreateUser(uid, email, payload.buyerName);
    const result = await db
      .insert(paymentTransactions)
      .values({
        receiptNumber: payload.receiptNumber,
        intentId: payload.intentId,
        appDocId: payload.appDocId,
        appTitle: payload.appTitle,
        recipientAuthorId: payload.recipientAuthorId,
        buyerUid: uid,
        buyerName: payload.buyerName,
        amountCents: payload.amountCents,
        creatorNetCents: payload.creatorNetCents,
        platformFeeCents: payload.platformFeeCents,
        currency: payload.currency,
        paymentType: payload.paymentType,
        cardBrand: payload.cardBrand,
        cardLast4: payload.cardLast4,
        status: 'succeeded',
      })
      .onConflictDoNothing()
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database payment insert failed:', error);
    throw new Error('Failed to record payment transaction in database.', { cause: error });
  }
}

export async function getUserQuestionnairesFromSql(uid: string, isOwnerAdmin: boolean) {
  try {
    if (isOwnerAdmin) {
      return await db
        .select()
        .from(publisherQuestionnaires)
        .orderBy(desc(publisherQuestionnaires.createdAt));
    }
    return await db
      .select()
      .from(publisherQuestionnaires)
      .where(eq(publisherQuestionnaires.authorUid, uid))
      .orderBy(desc(publisherQuestionnaires.createdAt));
  } catch (error) {
    console.error('Database questionnaire select failed:', error);
    throw new Error('Failed to load publisher questionnaires.', { cause: error });
  }
}
