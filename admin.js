import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

// --- SECURITY PROTOCOL ---
// Replace this exactly with the user's provided email.
const ADMIN_EMAIL = "argaikwad24@gmail.com"; 
let allUsersData = []; // Store fetched users for CSV export

const elOverlay = document.getElementById("auth-overlay");
const elDashboard = document.getElementById("admin-dashboard");
const elAdminName = document.getElementById("admin-name");
const elAdminAvatar = document.getElementById("admin-avatar");
const btnLogout = document.getElementById("admin-logout-btn");

// Block access if not the master admin
onAuthStateChanged(auth, (user) => {
    if (user && user.email === ADMIN_EMAIL) {
        // Access Granted
        elOverlay.style.opacity = "0";
        setTimeout(() => {
            elOverlay.style.display = "none";
            elDashboard.classList.remove("hidden");
            
            // Set Sidebar Profile
            elAdminName.innerText = user.displayName;
            elAdminAvatar.innerText = user.displayName.charAt(0).toUpperCase();
            
            // Initialize Dashboard Data
            fetchAllData();
        }, 500);
    } else {
        // Access Denied
        alert("ACCESS DENIED: You do not have administrator privileges.");
        window.location.href = "index.html";
    }
});

// Logout
btnLogout.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
});

// --- NAVIGATION LOGIC ---
const navBtns = document.querySelectorAll(".nav-btn");
const panels = document.querySelectorAll(".admin-panel");
const panelTitle = document.getElementById("panel-title");

navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        // Update active button
        navBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        panelTitle.innerHTML = btn.innerHTML; // Copy icon and text

        // Show target panel
        const targetId = btn.getAttribute("data-target");
        panels.forEach(p => p.classList.remove("active"));
        document.getElementById(targetId).classList.add("active");
    });
});

document.getElementById("refresh-data-btn").addEventListener("click", () => {
    fetchAllData();
});

document.getElementById("leaderboard-filter").addEventListener("change", (e) => {
    fetchLeaderboardData(e.target.value);
});


// --- DATA FETCHING ENGINE ---

async function fetchAllData() {
    console.log("Fetching all admin data...");
    await Promise.all([
        fetchOverviewAndUsers(),
        fetchLeaderboardData("grid"), // Default load
        fetchFeedback()
    ]);
}

// 1. Users & Overview
async function fetchOverviewAndUsers() {
    try {
        const q = query(collection(db, "users"), orderBy("lastLogin", "desc"));
        const snapshot = await getDocs(q);
        
        const tbody = document.getElementById("table-body-users");
        tbody.innerHTML = "";
        allUsersData = []; // Reset stored users data
        
        let userCount = 0;
        let activityHTML = "";

        snapshot.forEach(doc => {
            const data = doc.data();
            userCount++;
            
            // Format Date safely
            let lastLoginStr = "Unknown";
            if(data.lastLogin && data.lastLogin.toDate) {
                lastLoginStr = data.lastLogin.toDate().toLocaleString();
            }

            // Save to global array for CSV export
            allUsersData.push({
                name: data.name || "Unknown",
                email: data.email || "No Email",
                lastLogin: lastLoginStr,
                id: doc.id
            });

            // Build Table Row
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <div class="user-cell">
                        <div class="avatar-circle" style="width:32px; height:32px; font-size:0.8rem;">
                            ${data.name ? data.name.charAt(0).toUpperCase() : "?"}
                        </div>
                        <strong>${data.name || "Unknown"}</strong>
                    </div>
                </td>
                <td style="color:var(--text-muted);">${data.email || "No Email"}</td>
                <td>${lastLoginStr}</td>
                <td style="font-family:monospace; font-size:0.8rem; opacity:0.5;">${doc.id}</td>
            `;
            tbody.appendChild(tr);

            // Build Recent Activity list (just grab the 5 most recent logins)
            if(userCount <= 5) {
                activityHTML += `
                    <div style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); display:flex; justify-content: space-between;">
                        <span><strong>${data.name}</strong> logged into the portal.</span>
                        <span style="color: var(--text-muted); font-size: 0.85rem;">${lastLoginStr}</span>
                    </div>
                `;
            }
        });

        if (userCount === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No users registered yet.</td></tr>`;
            activityHTML = `<p style="text-align:center; color: var(--text-muted); padding: 2rem;">No recent activity.</p>`;
        }

        // Update Stats
        document.getElementById("stat-total-users").innerText = userCount;
        document.getElementById("recent-activity-list").innerHTML = activityHTML;
        
    } catch (e) {
        console.error("Error fetching users:", e);
        document.getElementById("table-body-users").innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Error loading users.</td></tr>`;
    }
}

// 2. Leaderboards
async function fetchLeaderboardData(gameId) {
    try {
        const tbody = document.getElementById("table-body-leaderboards");
        tbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>Loading scores...</td></tr>";

        const q = query(collection(db, "leaderboards", gameId, "scores"), orderBy("score", "desc"), limit(50));
        const snapshot = await getDocs(q);
        
        tbody.innerHTML = "";
        let rank = 1;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Format score based on our new numeric logic vs old string logic
            let displayScore = "0";
            if (typeof data.score === "number") {
                displayScore = `${data.score} / ${data.totalLevels || 18}`;
            } else if (typeof data.score === "string") {
                displayScore = data.score;
            }

            let dateStr = "Unknown";
            if(data.timestamp && data.timestamp.toDate) {
                dateStr = data.timestamp.toDate().toLocaleDateString();
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><span style="background:rgba(255,255,255,0.1); padding:0.25rem 0.75rem; border-radius:12px; font-weight:bold;">#${rank++}</span></td>
                <td><strong>${data.name || "Unknown"}</strong></td>
                <td style="color:var(--accent); font-weight:bold;">${displayScore}</td>
                <td style="color:var(--text-muted);">${dateStr}</td>
            `;
            tbody.appendChild(tr);
        });

        if (rank === 1) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No scores recorded for this game yet.</td></tr>`;
        }
        
    } catch(e) {
        console.error("Error fetching leaderboard:", e);
         document.getElementById("table-body-leaderboards").innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Requires Firebase Index. Check console.</td></tr>`;
    }
}

// 3. Feedback
async function fetchFeedback() {
    try {
        const q = query(collection(db, "feedback"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        
        const tbody = document.getElementById("table-body-feedback");
        tbody.innerHTML = "";
        
        let count = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            count++;
            
            let dateStr = "Unknown";
            if(data.timestamp && data.timestamp.toDate) {
                dateStr = data.timestamp.toDate().toLocaleString();
            }

            let badgeColor = "var(--primary)";
            if(data.type === "bug") badgeColor = "var(--error)";
            if(data.type === "suggestion") badgeColor = "var(--accent)";

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="white-space: nowrap; color:var(--text-muted); font-size:0.85rem;">${dateStr}</td>
                <td>
                    <strong>${data.name || "Anonymous"}</strong><br>
                    <span style="font-size:0.8rem; color:var(--text-muted);">${data.email || "No email"}</span>
                </td>
                <td>
                    <span style="background-color: ${badgeColor}22; color: ${badgeColor}; border: 1px solid ${badgeColor}55; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; text-transform: uppercase;">
                        ${data.type || "other"}
                    </span>
                </td>
                <td style="max-width: 300px;">${data.message || "(No message provided)"}</td>
            `;
            tbody.appendChild(tr);
        });

        if (count === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No feedback received yet.</td></tr>`;
        }

        // Update Stats
        document.getElementById("stat-total-feedback").innerText = count;

    } catch (e) {
        console.error("Error fetching feedback:", e);
        document.getElementById("table-body-feedback").innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Requires Firebase Index. Check console.</td></tr>`;
    }
}

// --- CSV EXPORT LOGIC ---
document.getElementById("download-users-csv").addEventListener("click", () => {
    if (allUsersData.length === 0) {
        alert("No users data available to download.");
        return;
    }

    let csvContent = "Name,Email,Last Login,User ID\n";
    allUsersData.forEach(user => {
        // Escape quotes and commas inside text
        const safeName = `"${user.name.replace(/"/g, '""')}"`;
        const safeEmail = `"${user.email.replace(/"/g, '""')}"`;
        const safeLogin = `"${user.lastLogin.replace(/"/g, '""')}"`;
        const safeId = `"${user.id.replace(/"/g, '""')}"`;

        csvContent += `${safeName},${safeEmail},${safeLogin},${safeId}\n`;
    });

    // Create a Blob and trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "aptigame_users_export.csv");
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});
