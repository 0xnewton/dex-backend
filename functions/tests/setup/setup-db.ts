import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

module.exports = async () => {
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ projectId: "demo-test" });

  const db = getFirestore(app);
  db.settings({ host: "localhost:8080", ssl: false });

  // seed here
  // ..
};
