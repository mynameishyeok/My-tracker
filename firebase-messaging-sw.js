importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

// index.html 안의 FIREBASE_CONFIG 와 반드시 동일한 값이어야 합니다.
firebase.initializeApp({
  apiKey: "AIzaSyDRR1limycC830YxqDjjzTs9CpRjVEpYdg",
  authDomain: "my-egg-e402b.firebaseapp.com",
  projectId: "my-egg-e402b",
  storageBucket: "my-egg-e402b.firebasestorage.app",
  messagingSenderId: "338209721808",
  appId: "1:338209721808:web:7e82095dba14f09aa5bdd5",
});

const messaging = firebase.messaging();

// 앱이 꺼져있거나 다른 화면을 보고 있을 때 도착하는 알림을 처리
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || "알림";
  const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || "";
  self.registration.showNotification(title, { body: body });
});
