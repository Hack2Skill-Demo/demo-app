import { logger } from 'firebase-functions/v2';
import * as v1 from 'firebase-functions/v1';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/firebase';
import { trackOutcome } from '../lib/track';

/**
   * Sets up a profile when a customer signs up with an email address or a phone number. Anonymous visitors
   * (who only entered an access code) get none. Auth's onCreate trigger exists only in first-generation functions.
   */
export const onUserCreate = v1
  .region('us-central1')
  .auth.user()
  .onCreate(async (user) => {
      if (!user.email && !user.phoneNumber) return;
      await trackOutcome('accounts-onUserCreate', async () => {
        const firstName = user.email ? user.email.split('@')[0] : user.displayName!.split(' ')[0];
        await db.doc(`profiles/${user.uid}`).set({
          firstName,
          email: user.email ?? null,
          phone: user.phoneNumber ?? null,
          signInMethod: user.email ? 'email' : 'phone',
          createdAt: Timestamp.now(),
        });
      });
      logger.info('profile created', { uid: user.uid });
    });