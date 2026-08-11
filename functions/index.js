/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// 매분 실행되어 remindAt이 지난, 아직 발송 안 된 reminders를 FCM으로 푸시 발송
exports.sendDueReminders = onSchedule(
  { schedule: "* * * * *", timeZone: "Asia/Seoul" },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    const snapshot = await db.collection("reminders").where("fired", "==", false).get();
    if (snapshot.empty) return;

    const due = snapshot.docs.filter((doc) => {
      const remindAt = doc.data().remindAt;
      return remindAt && remindAt.toMillis() <= now.toMillis();
    });
    if (due.length === 0) return;

    await Promise.all(due.map(async (doc) => {
      const { title, fcmToken } = doc.data();

      if (fcmToken) {
        try {
          await admin.messaging().send({
            token: fcmToken,
            notification: {
              title: "⏰ 알림",
              body: title || "",
            },
          });
        } catch (e) {
          logger.error(`reminder ${doc.id} 발송 실패`, e);
        }
      }

      await doc.ref.update({ fired: true, firedAt: admin.firestore.FieldValue.serverTimestamp() });
    }));

    logger.info(`reminder ${due.length}건 발송 완료`);
  }
);
