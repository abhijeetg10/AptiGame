/**
 * import-to-agy.js
 * 
 * Tool to import aptiverse_fbs_export.json into AgyDB (localStorage).
 */

async function importExistingData(jsonData) {
    if (!jsonData) {
        throw new Error("No data provided for import.");
    }

    console.log("Starting data import to AgyDB...");

    // 1. Process standard collections
    Object.keys(jsonData.collections).forEach(colName => {
        if (colName === 'leaderboards') return; // Handled separately
        
        const key = `agy_col_${colName}`;
        localStorage.setItem(key, JSON.stringify(jsonData.collections[colName]));
        console.log(` Imported collection: ${colName}`);
    });

    // 2. Process hierarchical leaderboards
    if (jsonData.collections.leaderboards) {
        Object.keys(jsonData.collections.leaderboards).forEach(gameId => {
            const key = `agy_col_leaderboards_${gameId}_scores`;
            localStorage.setItem(key, JSON.stringify(jsonData.collections.leaderboards[gameId]));
            console.log(` Imported leaderboard: ${gameId}`);
        });
    }

    // 3. Process system stats (if direct doc)
    // Add logic here if needed for specifically isolated docs

    console.log("Import Complete! Reload the page to see changes.");
}

window.importExistingData = importExistingData;
console.log("Data Import Utility Loaded. Run 'await importExistingData(data)' with your JSON export.");
