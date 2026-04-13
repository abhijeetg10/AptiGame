import { onAuthStateChanged, signOut, setDoc, doc, getDoc, increment, auth, db, provider, signInWithPopup, arrayUnion } from "./db-shim.js";

const loginBtn = document.getElementById("nav-login-btn");
const userProfile = document.getElementById("nav-user-profile");
const userAvatar = document.getElementById("nav-user-avatar");
const userName = document.getElementById("nav-user-name");
const logoutBtn = document.getElementById("nav-logout-btn");




// Detect login state
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (loginBtn) loginBtn.style.display = "none";
        if (userProfile) {
            userProfile.style.display = "flex";
            const firstName = user.displayName ? user.displayName.split(" ")[0] : "User";
            if (userName) userName.innerText = firstName;
            if (userAvatar) {
                const initial = firstName.charAt(0).toUpperCase();
                userAvatar.innerText = initial;
            }
        }
        // ROBUST SYNC: Ensure the user exists in Firestore even if they were auto-logged in
        await syncUserToFirestore(user);
    } else {
        if (loginBtn) loginBtn.style.display = "inline-block";
        if (userProfile) userProfile.style.display = "none";
    }
});

// ROBUST SYNC FUNCTION
async function syncUserToFirestore(user) {
    if (!user) return;
    try {
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);
        const today = new Date().toLocaleDateString();
        
        let loginsToday = 1;
        let hasRated = false;

        let firestoreData = null;
        if (userSnap.exists()) {
            firestoreData = userSnap.data();
            hasRated = firestoreData.hasRated || false;
            loginsToday = firestoreData.loginsToday || 1;
        }

        const updateData = {
            lastLogin: new Date(),
            photoURL: user.photoURL || "",
            loginsToday: loginsToday,
            totalLogins: increment(0),
            hasRated: hasRated
        };

        if (user.displayName) updateData.name = user.displayName;
        if (user.email) updateData.email = user.email;

        // Initialize score fields for new users if they don't exist
        const defaultScores = {
            totalScore: 0,
            modulesCompleted: 0,
            avgAccuracy: 0,
            gameScores: {}
        };

        if (!userSnap.exists()) {
            Object.assign(updateData, defaultScores);
            // Increment Global Total Users
            await setDoc(doc(db, "system_stats", "global"), { totalUsers: increment(1) }, { merge: true });
        }

        // Increment Global Active Sessions
        await setDoc(doc(db, "system_stats", "global"), { activeSessions24h: increment(1) }, { merge: true });

        if (updateData.name || updateData.email) {
            console.log(`[AUTH] Syncing user data for: ${user.email} (UID: ${user.uid})`);
            await setDoc(userDocRef, updateData, { merge: true }); 
            console.log(`[AUTH] User sync successful.`);
        }
    } catch (e) {
        console.error("[AUTH] Auto-sync failed:", e);
    }
}


// LOGIN FUNCTION
export const loginWithGoogle = async () => {

    try {

        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // AgyDB Local Auth Check Logging (For the Admin Dashboard)
        try {
            const userDocRef = doc(db, "users", user.uid);
            await setDoc(userDocRef, {
                name: user.displayName || "",
                email: user.email || "",
                lastLogin: new Date(),
                loginsToday: increment(1),
                totalLogins: increment(1),
                loginHistory: arrayUnion(new Date().toISOString())
            }, { merge: true }); 
            console.log("Explicit login tracked in Firestore.");
        } catch (dbError) {
            console.error("Failed to sync user to Database:", dbError);
        }

    } catch (error) {

        console.error("Login Failed", error);
        alert("Failed to log in with Google.");

    }

};


// LOGOUT
export const logout = async () => {

    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout Failed", error);
    }

};


// Button listeners
if (loginBtn) {

    loginBtn.addEventListener("click", (e) => {
        e.preventDefault();
        loginWithGoogle();
    });

}

if (logoutBtn) {

    logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        logout();
    });

}


// Helper function
export const getCurrentUser = () => {
    return auth.currentUser;
};


// Protect game links
document.addEventListener("DOMContentLoaded", () => {
    const gameLinks = document.querySelectorAll(".game-link");
    gameLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            if (!getCurrentUser()) {
                e.preventDefault();
                alert("Please log in to play the challenges!");
                loginWithGoogle();
            }
        });
    });
});
