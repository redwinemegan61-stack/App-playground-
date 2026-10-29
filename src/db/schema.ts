import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// Define the 'users' table using Firebase Auth UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: text('role').default('creator').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define the 'published_apps' table for customer-uploaded apps & games
export const publishedApps = pgTable('published_apps', {
  id: serial('id').primaryKey(),
  appDocId: text('app_doc_id').notNull().unique(),
  authorUid: text('author_uid')
    .references(() => users.uid)
    .notNull(),
  authorName: text('author_name').notNull(),
  title: text('title').notNull(),
  tagline: text('tagline').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  playType: text('play_type').notNull(),
  version: text('version').notNull(),
  externalUrl: text('external_url'),
  priceCents: integer('price_cents').default(0).notNull(),
  monetizationModel: text('monetization_model').notNull(),
  ageRating: text('age_rating').notNull(),
  contentAdvisory: text('content_advisory').notNull(),
  violenceLevel: text('violence_level').default('None').notNull(),
  fearLevel: text('fear_level').default('None').notNull(),
  languageLevel: text('language_level').default('None').notNull(),
  substancesLevel: text('substances_level').default('None').notNull(),
  gamblingThemes: text('gambling_themes').default('None').notNull(),
  userInteraction: text('user_interaction').default('No User-to-User Interaction').notNull(),
  generalSafetyStandards: boolean('general_safety_standards').default(true).notNull(),
  dataPrivacyPolicy: text('data_privacy_policy').notNull(),
  accessibilityFeatures: text('accessibility_features').notNull(),
  payoutMethod: text('payout_method').notNull(),
  stripePaymentLink: text('stripe_payment_link'),
  complianceCertificateId: text('compliance_certificate_id').notNull(),
  playsCount: integer('plays_count').default(0).notNull(),
  likesCount: integer('likes_count').default(0).notNull(),
  isPublic: boolean('is_public').default(false).notNull(),
  reviewStatus: text('review_status').default('pending').notNull(),
  adminReviewNotes: text('admin_review_notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define the 'publisher_questionnaires' table for Google Play content rating & safety questionnaires
export const publisherQuestionnaires = pgTable('publisher_questionnaires', {
  id: serial('id').primaryKey(),
  questionnaireDocId: text('questionnaire_doc_id').notNull().unique(),
  appDocId: text('app_doc_id').notNull(),
  authorUid: text('author_uid')
    .references(() => users.uid)
    .notNull(),
  studioName: text('studio_name').notNull(),
  supportContact: text('support_contact').notNull(),
  ageRating: text('age_rating').notNull(),
  contentAdvisory: text('content_advisory').notNull(),
  violenceLevel: text('violence_level').default('None').notNull(),
  fearLevel: text('fear_level').default('None').notNull(),
  languageLevel: text('language_level').default('None').notNull(),
  substancesLevel: text('substances_level').default('None').notNull(),
  gamblingThemes: text('gambling_themes').default('None').notNull(),
  userInteraction: text('user_interaction').default('No User-to-User Interaction').notNull(),
  generalSafetyStandards: boolean('general_safety_standards').default(true).notNull(),
  dataPrivacyPolicy: text('data_privacy_policy').notNull(),
  accessibilityFeatures: text('accessibility_features').notNull(),
  monetizationModel: text('monetization_model').notNull(),
  priceCents: integer('price_cents').default(0).notNull(),
  payoutMethod: text('payout_method').notNull(),
  stripePaymentLink: text('stripe_payment_link'),
  testedInBrowserSandbox: boolean('tested_in_browser_sandbox').default(true).notNull(),
  acceptedPublisherTerms: boolean('accepted_publisher_terms').default(true).notNull(),
  complianceCertificateId: text('compliance_certificate_id').notNull(),
  reviewStatus: text('review_status').default('pending').notNull(),
  adminReviewNotes: text('admin_review_notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define the 'payment_transactions' table for $0.99 upload fees, app licenses, and supporter passes
export const paymentTransactions = pgTable('payment_transactions', {
  id: serial('id').primaryKey(),
  receiptNumber: text('receipt_number').notNull().unique(),
  intentId: text('intent_id').notNull(),
  appDocId: text('app_doc_id').notNull(),
  appTitle: text('app_title').notNull(),
  recipientAuthorId: text('recipient_author_id').notNull(),
  buyerUid: text('buyer_uid')
    .references(() => users.uid)
    .notNull(),
  buyerName: text('buyer_name').notNull(),
  amountCents: integer('amount_cents').notNull(),
  creatorNetCents: integer('creator_net_cents').notNull(),
  platformFeeCents: integer('platform_fee_cents').notNull(),
  currency: text('currency').default('USD').notNull(),
  paymentType: text('payment_type').notNull(),
  cardBrand: text('card_brand').notNull(),
  cardLast4: text('card_last4').notNull(),
  status: text('status').default('succeeded').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define relationships
export const usersRelations = relations(users, ({ many }) => ({
  publishedApps: many(publishedApps),
  questionnaires: many(publisherQuestionnaires),
  payments: many(paymentTransactions),
}));

export const publishedAppsRelations = relations(publishedApps, ({ one }) => ({
  author: one(users, {
    fields: [publishedApps.authorUid],
    references: [users.uid],
  }),
}));

export const publisherQuestionnairesRelations = relations(publisherQuestionnaires, ({ one }) => ({
  author: one(users, {
    fields: [publisherQuestionnaires.authorUid],
    references: [users.uid],
  }),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  buyer: one(users, {
    fields: [paymentTransactions.buyerUid],
    references: [users.uid],
  }),
}));
