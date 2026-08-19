/**
 * One-shot script to repair Firebase custom claims for users whose claims are
 * missing or stale (e.g. after a manual DB edit without calling setClaims).
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/fix-claims.ts [firebaseUid]
 *
 * If a firebaseUid argument is provided, only that user is fixed.
 * Otherwise, all users with a businessId are processed.
 *
 * Requires the same env vars as the backend (.env):
 *   ADMIN_PROJECT_ID, ADMIN_CLIENT_EMAIL, ADMIN_PRIVATE_KEY, MONGODB_URI
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as admin from 'firebase-admin';
import mongoose from 'mongoose';

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.ADMIN_PROJECT_ID,
    clientEmail: process.env.ADMIN_CLIENT_EMAIL,
    privateKey: process.env.ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const UserSchema = new mongoose.Schema({
  firebaseUid: String,
  email: String,
  role: String,
  businessId: mongoose.Schema.Types.ObjectId,
  isPending: Boolean,
});

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');

  const UserModel = mongoose.model('User', UserSchema);
  const targetUid = process.argv[2];

  const query = targetUid
    ? { firebaseUid: targetUid, businessId: { $exists: true } }
    : { businessId: { $exists: true }, isPending: { $ne: true } };

  const users = await UserModel.find(query).lean();
  console.log(`Found ${users.length} user(s) to fix`);

  for (const user of users) {
    if (!user.firebaseUid || !user.businessId) continue;
    try {
      await admin.auth().setCustomUserClaims(user.firebaseUid, {
        role: user.role,
        businessId: String(user.businessId),
      });
      console.log(`✓ ${user.email} (${user.firebaseUid}) → role=${user.role} businessId=${user.businessId}`);
    } catch (err) {
      console.error(`✗ ${user.email} (${user.firebaseUid}):`, (err as Error).message);
    }
  }

  await mongoose.disconnect();
  console.log('Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
