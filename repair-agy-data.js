/**
 * repair-agy-data.js
 * 
 * Scans localStorage for legacy 'agy_doc_...' entries and synchronizes them
 * into the 'agy_col_...' arrays used for collection queries and the Admin Dashboard.
 */

function repairAgyData() {
    console.log("--- Starting AgyDB Data Repair ---");
    const keys = Object.keys(localStorage);
    const docKeys = keys.filter(k => k.startsWith('agy_doc_'));
    
    let repairs = 0;
    const collections = {};

    docKeys.forEach(key => {
        try {
            const data = JSON.parse(localStorage.getItem(key));
            const pathParts = key.replace('agy_doc_', '').split('_');
            
            // Reconstruct collection path
            // e.g., 'users_UID' -> collection 'users', id 'UID'
            // e.g., 'leaderboards_grid_scores_UID' -> collection 'leaderboards_grid_scores', id 'UID'
            if (pathParts.length < 2) return;
            
            const docId = pathParts[pathParts.length - 1];
            const colPath = pathParts.slice(0, -1).join('_');
            const colKey = `agy_col_${colPath}`;
            
            if (!collections[colKey]) {
                collections[colKey] = JSON.parse(localStorage.getItem(colKey) || '[]');
            }
            
            // Check if already in collection
            const exists = collections[colKey].some(item => (item._id || item.id) === docId);
            if (!exists) {
                const syncData = { ...data, _id: docId, id: docId };
                collections[colKey].push(syncData);
                repairs++;
                console.log(`Synced legacy doc to collection: ${colPath}/${docId}`);
            }
        } catch (e) {
            console.warn(`Failed to process key ${key}:`, e);
        }
    });

    // Save all updated collections
    Object.keys(collections).forEach(colKey => {
        localStorage.setItem(colKey, JSON.stringify(collections[colKey]));
    });

    console.log(`--- Repair Complete! ${repairs} documents synchronized. ---`);
    return repairs;
}

// Auto-run if possible or expose to window
window.repairAgyData = repairAgyData;
const count = repairAgyData();
if (count > 0) {
    alert(`Successfully synchronized ${count} legacy records. The dashboard should now show your data!`);
} else {
    console.log("No legacy records needed synchronization.");
}
