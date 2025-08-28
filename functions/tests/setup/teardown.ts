import { getApps, deleteApp } from "firebase-admin/app";

module.exports = async () => {
  // Optional: wipe emulator data
  // const app = getApps()[0];
  // if (app) {
  //   const db = (await import("firebase-admin/firestore")).getFirestore(app);
  //   const cols = await db.listCollections();
  //   for (const col of cols) {
  //     const snap = await col.get();
  //     await Promise.all(snap.docs.map((d) => d.ref.delete()));
  //   }
  // }

  // Cleanly shut down admin apps
  await Promise.all(getApps().map((app) => deleteApp(app)));
};