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

// 알림을 몇 번까지 반복 발송할지 (예약 시각부터 1분 간격으로 총 5회 = 4분 뒤까지)
const MAX_REMINDER_SENDS = 5;

// 매분 실행되어 remindAt이 지났고 사용자가 아직 확인 안 한 reminders를 FCM으로 푸시 발송.
// 확인(acknowledged)하기 전까지 1분마다 최대 MAX_REMINDER_SENDS번 반복 발송한다.
exports.sendDueReminders = onSchedule(
  { schedule: "* * * * *", timeZone: "Asia/Seoul" },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    const snapshot = await db.collection("reminders").where("acknowledged", "==", false).get();
    if (snapshot.empty) return;

    const due = snapshot.docs.filter((doc) => {
      const { remindAt, sentCount } = doc.data();
      return remindAt && remindAt.toMillis() <= now.toMillis() && (sentCount || 0) < MAX_REMINDER_SENDS;
    });
    if (due.length === 0) return;

    await Promise.all(due.map(async (doc) => {
      const { title, fcmToken, sentCount } = doc.data();

      if (fcmToken) {
        try {
          await admin.messaging().send({
            token: fcmToken,
            notification: {
              title: "⏰ 알림",
              body: title || "",
            },
            // tag를 reminder 문서 id로 고정 - 반복 발송돼도 알림이 여러 개 쌓이지 않고 1개로 갱신됨
            data: {
              tag: doc.id,
            },
          });
        } catch (e) {
          logger.error(`reminder ${doc.id} 발송 실패`, e);
        }
      }

      await doc.ref.update({
        sentCount: (sentCount || 0) + 1,
        lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }));

    logger.info(`reminder ${due.length}건 발송 완료`);
  }
);

// 파일이 스토리지에 며칠까지 남아있을 수 있는지 (공유일로부터 7일)
const PLAZA_FILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// 매일 새벽 3시 실행되어, 광장(공유방)에 올라온 지 7일 지난 파일을 Storage와
// Firestore 메타데이터에서 함께 정리한다. 방은 자동으로 지우지 않고 방장이 수동으로만 지운다.
exports.cleanupExpiredPlazaFiles = onSchedule(
  { schedule: "0 3 * * *", timeZone: "Asia/Seoul" },
  async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const now = Date.now();

    const roomsSnap = await db.collection("plazaRooms").get();
    if (roomsSnap.empty) return;

    let deletedCount = 0;

    for (const roomDoc of roomsSnap.docs) {
      const messagesSnap = await roomDoc.ref.collection("messages").where("type", "==", "file").get();
      for (const msgDoc of messagesSnap.docs) {
        const { createdAt, filePath } = msgDoc.data();
        if (!createdAt || now - createdAt.toMillis() < PLAZA_FILE_MAX_AGE_MS) continue;

        if (filePath) {
          try {
            await bucket.file(filePath).delete();
          } catch (e) {
            logger.error(`plaza 파일 삭제 실패: ${filePath}`, e);
          }
        }
        await msgDoc.ref.delete();
        deletedCount++;
      }
    }

    logger.info(`plaza 만료 파일 ${deletedCount}건 정리 완료`);
  }
);
