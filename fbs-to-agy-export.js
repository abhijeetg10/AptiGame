/**
 * fbs-to-agy-export.js
 * 
 * Utility to export Firestore data for AptiVerse to an Antigravity-friendly JSON format.
 * Run this in the browser console of your Admin Dashboard (admin.html).
 */

async function exportAllToAgy() {
    console.log("%c starting AptiVerse Firebase Export...", "color: #c90076; font-weight: bold; font-size: 1.2rem;");
    
    // Import Firestore functions from the same version used in the app
    const { collection, getDocs, query, orderBy, limit } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
    const { db } = await import("./db-shim.js");

    const exportData = {
        timestamp: new Date().toISOString(),
        project: "AptiVerse",
        collections: {}
    };

    const collectionsToExport = [
        "users",
        "feedback",
        "rating",
        "mock_results",
        "activity_logs",
        "system_stats",
        "traffic"
    ];

    const gameIds = ["motion", "sudoku", "inductive", "grid", "switch", "di", "rc"];

    try {
        // 1. Export Standard Collections
        for (const colName of collectionsToExport) {
            console.log(`Fetching collection: ${colName}...`);
            const snapshot = await getDocs(collection(db, colName));
            exportData.collections[colName] = [];
            snapshot.forEach(doc => {
                exportData.collections[colName].push({
                    id: doc.id,
                    ...doc.data()
                });
            });
        }

        // 2. Export Hierarchical Leaderboards
        console.log("Fetching leaderboards...");
        exportData.collections.leaderboards = {};
        for (const gameId of gameIds) {
            console.log(`  Fetching scores for: ${gameId}...`);
            const q = query(collection(db, "leaderboards", gameId, "scores"), orderBy("score", "desc"), limit(100));
            const snapshot = await getDocs(q);
            exportData.collections.leaderboards[gameId] = [];
            snapshot.forEach(doc => {
                exportData.collections.leaderboards[gameId].push({
                    id: doc.id,
                    ...doc.data()
                });
            });
        }

        console.log("%c Export Complete!", "color: #10b981; font-weight: bold;");
        
        // 3. Trigger Download
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `aptiverse_fbs_export_${new Date().getTime()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        return "Export successful! Please provide the downloaded JSON file to Antigravity.";

    } catch (error) {
        console.error("Export failed:", error);
        return `Export failed: ${error.message}`;
    }
}

// Global exposure for console use
window.exportAllToAgy = exportAllToAgy;
console.log("AptiVerse Export Utility Loaded. Run 'await exportAllToAgy()' to begin.");
