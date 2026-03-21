import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAeEyap9MQ3eINdVhY3GGhdideIaSQ7M_Q",
    authDomain: "aptigame.firebaseapp.com",
    projectId: "aptigame",
    storageBucket: "aptigame.firebasestorage.app",
    messagingSenderId: "201198068351",
    appId: "1:201198068351:web:13a0b2c6aaacc21632154a",
    measurementId: "G-C9PZ77HM98"
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

async function recoverAllData() {
    try {
        console.log("--- Starting Firebase Data Recovery ---");
        const collectionsToRecover = ['users', 'mock_results', 'ratings', 'feedback', 'activity_logs', 'system_stats', 'traffic'];
        const gameLeaderboards = ['grid', 'switch', 'sudoku', 'inductive', 'motion', 'di', 'rc'];

        let totalRecovered = 0;

        // 1. Recover Standard Collections
        for (const colName of collectionsToRecover) {
            console.log(`Recovering collection: ${colName}...`);
            const querySnapshot = await getDocs(collection(firestore, colName));
            const items = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                // Ensure timestamps are preserved in a way AgyDB can decode
                const syncData = { ...data, _id: doc.id, id: doc.id };
                items.push(syncData);
                
                // Also save individual doc key for AgyDB consistency
                localStorage.setItem(`agy_doc_${colName}_${doc.id}`, JSON.stringify(data));
            });
            localStorage.setItem(`agy_col_${colName}`, JSON.stringify(items));
            totalRecovered += items.length;
            console.log(`   Recovered ${items.length} docs from ${colName}`);
        }

        // 2. Recover Leaderboards
        for (const gameId of gameLeaderboards) {
            console.log(`Recovering leaderboard: ${gameId}...`);
            try {
                const querySnapshot = await getDocs(collection(firestore, 'leaderboards', gameId, 'scores'));
                const items = [];
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    const syncData = { ...data, _id: doc.id, id: doc.id };
                    items.push(syncData);
                    
                    // Also save individual doc key
                    localStorage.setItem(`agy_doc_leaderboards_${gameId}_scores_${doc.id}`, JSON.stringify(data));
                });
                localStorage.setItem(`agy_col_leaderboards_${gameId}_scores`, JSON.stringify(items));
                totalRecovered += items.length;
                console.log(`   Recovered ${items.length} scores from ${gameId}`);
            } catch (err) {
                console.warn(`Could not recover leaderboard for ${gameId}:`, err);
            }
        }

        console.log(`--- Recovery Complete! Total items recovered: ${totalRecovered} ---`);
        alert(`Data Recovery Successful!\n\nSynchronized ${totalRecovered} records from Firebase into your local database.\n\nPlease refresh the dashboard to see your users and scores.`);
    } catch (e) {
        console.error("Recovery failed:", e);
        alert("Recovery Failed! Please check your internet connection or console for errors.");
    }
}

window.recoverFirebaseData = recoverAllData;
console.log("Firebase Recovery Utility Loaded. Run 'await recoverFirebaseData()' to sync legacy data.");
