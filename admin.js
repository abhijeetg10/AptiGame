import { collection, getDocs, query, orderBy, limit, deleteDoc, doc, where, Timestamp, writeBatch, getDoc, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

// --- SECURITY PROTOCOL ---
// Replace this exactly with the user's provided email.
const ADMIN_EMAIL = "argaikwad24@gmail.com"; 
let allUsersData = []; // Store fetched users for CSV export
let allLeaderboardData = [];
let allFeedbackData = [];
let allRatingsData = [];
let allMockResultsData = [];
let trafficChart = null;

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

// Traffic Filters
document.querySelectorAll(".traffic-filter").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".traffic-filter").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        fetchTrafficData(btn.getAttribute("data-range"));
    });
});


// --- DATA FETCHING ENGINE ---

async function fetchAllData() {
    console.log("Fetching all admin data...");
    await Promise.all([
        fetchOverviewAndUsers(),
        // 2. Initial Leaderboard load (Default to Overall)
        fetchLeaderboardData("overall"), // Default load
        fetchFeedback(),
        fetchRatings(),
        fetchMockResults(),
        fetchTrafficData("24h") // Default load traffic
    ]);
}

// 1. Users & Overview
async function fetchOverviewAndUsers() {
    try {
        const tbody = document.getElementById("table-body-users");
        tbody.innerHTML = "<tr><td colspan='6' style='text-align:center;'>Loading statistics...</td></tr>";

        // OPTIMIZED STATS FETCH: 1 Read instead of counting thousands of docs
        try {
            const statsDoc = await getDoc(doc(db, "system_stats", "global"));
            if (statsDoc.exists()) {
                const stats = statsDoc.data();
                document.getElementById("stat-total-users").innerText = stats.totalUsers || 0;
                document.getElementById("stat-total-mock").innerText = stats.totalMockTests || 0;
            } else {
                // FALLBACK: If global stats doc doesn't exist, get real counts (1 read per collection)
                const userCountSnap = await getCountFromServer(collection(db, "users"));
                document.getElementById("stat-total-users").innerText = userCountSnap.data().count;

                const mockCountSnap = await getCountFromServer(collection(db, "mock_results"));
                document.getElementById("stat-total-mock").innerText = mockCountSnap.data().count;
            }
        } catch (statsErr) {
            console.warn("Global stats fetch failed, trying direct counts:", statsErr);
            // Even if statsDoc fails, we try direct counts
            try {
                const userCountSnap = await getCountFromServer(collection(db, "users"));
                document.getElementById("stat-total-users").innerText = userCountSnap.data().count;

                const mockCountSnap = await getCountFromServer(collection(db, "mock_results"));
                document.getElementById("stat-total-mock").innerText = mockCountSnap.data().count;
            } catch (fallbackErr) {
                console.error("Direct counts also failed:", fallbackErr);
            }
        }

        // Fetch Recent Users ONLY (Limit 50) to minimize reads
        let snapshot;
        try {
            const q = query(collection(db, "users"), orderBy("lastLogin", "desc"), limit(50));
            snapshot = await getDocs(q);
        } catch (indexError) {
            console.warn("User index missing, falling back to limited fetch:", indexError);
            snapshot = await getDocs(query(collection(db, "users"), limit(50)));
        }
        
        tbody.innerHTML = "";
        allUsersData = []; 
        
        let userCount = 0;
        let activityHTML = "";

        let docs = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            data._id = docSnap.id;
            docs.push(data);
        });

        docs.forEach(data => {
            userCount++;
            
            // Format Date safely
            let lastLoginStr = "Unknown";
            if (data.lastLogin) {
                if (data.lastLogin.toDate) {
                    lastLoginStr = data.lastLogin.toDate().toLocaleString();
                } else if (data.lastLogin instanceof Date) {
                    lastLoginStr = data.lastLogin.toLocaleString();
                } else {
                    lastLoginStr = new Date(data.lastLogin).toLocaleString();
                }
            }

            // Save to global array for CSV export
            allUsersData.push({
                name: data.name || "Unknown",
                email: data.email || "No Email",
                loginsToday: data.loginsToday || 0,
                totalLogins: typeof data.totalLogins === 'object' ? 0 : (data.totalLogins || 0),
                lastLogin: lastLoginStr,
                id: data._id,
                history: data.loginHistory || []
            });

            // Build Table Row
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <div class="user-cell">
                        <div class="avatar-circle">
                            ${data.name ? data.name.charAt(0).toUpperCase() : "?"}
                        </div>
                        <strong>${data.name || "Unknown"}</strong>
                    </div>
                </td>
                <td style="color:var(--admin-text-muted);">${data.email || "No Email"}</td>
                <td style="text-align:center; font-weight:700; color:var(--warning);">${data.loginsToday || 0}</td>
                <td style="text-align:center; font-weight:700;">${typeof data.totalLogins === 'object' ? 1 : (data.totalLogins || 0)}</td>
                <td>${lastLoginStr}</td>
                <td>
                    <button class="btn btn-outline show-history-btn" data-id="${data._id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
                        <i class="fas fa-history"></i> History
                    </button>
                </td>
            `;
            tbody.appendChild(tr);

            // Build Recent Activity list (just grab the 5 most recent logins)
            if(userCount <= 5) {
                const displayName = data.name || data.email || "Unknown User";
                activityHTML += `
                    <div style="padding: 1rem; display:flex; justify-content: space-between; border-bottom: 1px solid var(--admin-border); animation: fadeIn 0.3s ease forwards;">
                        <span><strong>${displayName}</strong> logged into the portal.</span>
                        <span style="color: var(--admin-text-muted); font-size: 0.85rem;">${lastLoginStr}</span>
                    </div>
                `;
            }
        });

        if (userCount === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No users registered yet.</td></tr>`;
            activityHTML = `<p style="text-align:center; color: var(--pluto-text-muted); padding: 2rem;">No recent activity.</p>`;
        } else {
            // Add listeners for history buttons
            document.querySelectorAll(".show-history-btn").forEach(btn => {
                btn.onclick = (e) => {
                    e.preventDefault();
                    showLoginHistory(btn.getAttribute("data-id"));
                };
            });
        }

        // Update Stats
        document.getElementById('panel-title').innerText = 'AptiVerse Overview';
        
        // Calculate Active Sessions (Logins in last 24h)
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const activeSessions = docs.filter(u => {
            const lastLogin = u.lastLogin?.toDate ? u.lastLogin.toDate() : new Date(u.lastLogin || 0);
            return lastLogin >= dayAgo;
        }).length;

        const recentActivityEl = document.getElementById("recent-activity-list");
        if (recentActivityEl) recentActivityEl.innerHTML = activityHTML;
        
    } catch (e) {
        console.error("Error fetching users:", e);
        document.getElementById("table-body-users").innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">Error loading users.</td></tr>`;
    }
}

// 2. Leaderboards
async function fetchLeaderboardData(gameId) {
    try {
        const tbody = document.getElementById("table-body-leaderboards");
        tbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>Loading scores...</td></tr>";

        let q;
        if (gameId === 'overall') {
            q = query(collection(db, "users"), orderBy("totalScore", "desc"), limit(50));
        } else {
            q = query(collection(db, "leaderboards", gameId, "scores"), orderBy("score", "desc"), limit(50));
        }
        
        const snapshot = await getDocs(q);
        
        tbody.innerHTML = "";
        allLeaderboardData = [];
        let rank = 1;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Format score based on our new numeric logic vs old string logic
            let displayScore = "0";
            if (gameId === 'overall') {
                displayScore = data.totalScore || 0;
            } else {
                if (typeof data.score === "number") {
                    let total = data.totalLevels || 18;
                    displayScore = `${data.score} / ${total}`;
                } else if (typeof data.score === "string") {
                    displayScore = data.score;
                }
            }

            let dateStr = "N/A";
            if(gameId === 'overall') {
                dateStr = data.lastLogin?.toDate ? data.lastLogin.toDate().toLocaleDateString() : "Active";
            } else if(data.timestamp && data.timestamp.toDate) {
                dateStr = data.timestamp.toDate().toLocaleDateString();
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><span style="background:var(--pluto-border); padding:0.25rem 0.75rem; border-radius:12px; font-weight:bold; color:var(--pluto-text);">#${rank}</span></td>
                <td><strong>${data.name || "Unknown"}</strong></td>
                <td style="color:var(--pluto-blue); font-weight:bold;">${displayScore}</td>
                <td style="color:var(--pluto-text-muted);">${dateStr}</td>
            `;
            tbody.appendChild(tr);

            allLeaderboardData.push({
                rank: rank,
                name: data.name || "Unknown",
                score: displayScore,
                date: dateStr,
                game: gameId
            });

            rank++;
        });

        if (rank === 1) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem; color:var(--pluto-text-muted);">No scores recorded for this game yet.</td></tr>`;
        }
        
    } catch(e) {
        console.error("Error fetching leaderboard:", e);
         document.getElementById("table-body-leaderboards").innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--pluto-red);">Requires Firebase Index. Check console.</td></tr>`;
    }
}

// 3. Feedback
async function fetchFeedback() {
    try {
        let snapshot;
        try {
            const q = query(collection(db, "feedback"), orderBy("timestamp", "desc"));
            snapshot = await getDocs(q);
        } catch (indexError) {
            console.warn("Feedback index missing, falling back to client-side sort:", indexError);
            snapshot = await getDocs(collection(db, "feedback"));
        }
        
        const tbody = document.getElementById("table-body-feedback");
        tbody.innerHTML = "";
        allFeedbackData = [];
        
        let docs = [];
        snapshot.forEach(doc => docs.push(doc.data()));

        // Client-side sort fallback if needed (or just sort always to be safe)
        docs.sort((a, b) => {
            const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(0);
            const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(0);
            return dateB - dateA;
        });

        let count = 0;
        let totalRating = 0;
        let ratedCount = 0;

        docs.forEach(data => {
            count++;
            if (data.rating) {
                totalRating += data.rating;
                ratedCount++;
            }

            let dateStr = "Unknown";
            if (data.timestamp) {
                if (data.timestamp.toDate) {
                    dateStr = data.timestamp.toDate().toLocaleString();
                } else if (data.timestamp instanceof Date) {
                    dateStr = data.timestamp.toLocaleString();
                } else {
                    dateStr = new Date(data.timestamp).toLocaleString();
                }
            }

            let badgeColor = "var(--pluto-blue)";
            if(data.type === "bug") badgeColor = "var(--pluto-red)";
            if(data.type === "suggestion") badgeColor = "var(--pluto-orange)";

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="white-space: nowrap; color:var(--pluto-text-muted); font-size:0.85rem;">${dateStr}</td>
                <td>
                    <strong>${data.name || "Anonymous"}</strong><br>
                    <span style="font-size:0.8rem; color:var(--pluto-text-muted);">${data.email || "No email"}</span>
                </td>
                <td>
                    <span style="background-color: ${badgeColor}22; color: ${badgeColor}; border: 1px solid ${badgeColor}55; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; text-transform: uppercase;">
                        ${data.type || "other"}
                    </span>
                </td>
                <td>
                    <div style="color: #fbbf24; font-size: 0.85rem;">
                        ${data.rating ? "★".repeat(data.rating).padEnd(5, "☆") : "N/A"}
                    </div>
                </td>
                <td style="max-width: 300px;">${data.message || "(No message provided)"}</td>
            `;
            tbody.appendChild(tr);

            allFeedbackData.push({
                date: dateStr,
                sender: data.name || "Anonymous",
                email: data.email || "No email",
                category: data.type || "other",
                rating: data.rating || "N/A",
                message: data.message || ""
            });
        });

        if (count === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color:var(--pluto-text-muted);">No feedback received yet.</td></tr>`;
        }

        // Update Stats
        const avgRating = ratedCount > 0 ? (totalRating / ratedCount).toFixed(1) : "0.0";
        const feedbackStatEl = document.getElementById("stat-total-feedback");
        if (feedbackStatEl) {
            feedbackStatEl.innerHTML = `${count} <span style="font-size: 0.8rem; opacity: 0.7; font-weight: 500;">(Avg: ${avgRating} ★)</span>`;
        }

    } catch (e) {
        console.error("Error fetching feedback:", e);
        document.getElementById("table-body-feedback").innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--pluto-red);">Error loading feedback. Check console.</td></tr>`;
    }
}
// 4. Ratings
async function fetchRatings() {
    try {
        let snapshot;
        try {
            const q = query(collection(db, "rating"), orderBy("timestamp", "desc"));
            snapshot = await getDocs(q);
        } catch (indexError) {
            console.warn("Ratings index missing, falling back to client-side sort:", indexError);
            snapshot = await getDocs(collection(db, "rating"));
        }
        
        const tbody = document.getElementById("table-body-ratings");
        tbody.innerHTML = "";
        allRatingsData = [];
        
        let docs = [];
        snapshot.forEach(doc => docs.push(doc.data()));

        // Sort on client side
        docs.sort((a, b) => {
            const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(0);
            const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(0);
            return dateB - dateA;
        });

        let totalStars = 0;
        let count = 0;

        docs.forEach(data => {
            count++;
            totalStars += data.rating || 0;
            
            let dateStr = "Unknown";
            if (data.timestamp) {
                if (data.timestamp.toDate) {
                    dateStr = data.timestamp.toDate().toLocaleString();
                } else if (data.timestamp instanceof Date) {
                    dateStr = data.timestamp.toLocaleString();
                } else {
                    dateStr = new Date(data.timestamp).toLocaleString();
                }
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="white-space: nowrap; color:var(--pluto-text-muted); font-size:0.85rem;">${dateStr}</td>
                <td>
                    <strong>${data.userName || "Guest"}</strong>
                    <div style="font-size: 0.75rem; color: var(--pluto-text-muted); opacity: 0.8;">${data.userEmail || ""}</div>
                </td>
                <td>
                    <div style="color: #fbbf24; font-weight: bold;">
                        ${data.rating} <i class="fas fa-star" style="font-size:0.8rem;"></i>
                    </div>
                </td>
                <td style="max-width: 400px; color: var(--text-dark);">${data.comment || `<i style="color:var(--text-muted)">No comment</i>`}</td>
            `;
            tbody.appendChild(tr);

            allRatingsData.push({
                date: dateStr,
                user: data.userName || "Guest",
                rating: data.rating,
                comment: data.comment || ""
            });
        });

        if (count === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem; color:var(--text-muted);">No ratings available.</td></tr>`;
            document.getElementById("stat-avg-rating").innerText = "0.0";
        } else {
            const avg = (totalStars / count).toFixed(1);
            document.getElementById("stat-avg-rating").innerText = avg;
        }

    } catch (e) {
        console.error("Error fetching ratings:", e);
        document.getElementById("table-body-ratings").innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Error loading ratings.</td></tr>`;
    }
}

// 5. Mock Test Results
async function fetchMockResults() {
    try {
        let snapshot;
        try {
            const q = query(collection(db, "mock_results"), orderBy("timestamp", "desc"));
            snapshot = await getDocs(q);
        } catch (indexError) {
            console.warn("Mock results index missing, falling back to client-side sort:", indexError);
            snapshot = await getDocs(collection(db, "mock_results"));
        }
        
        const tbody = document.getElementById("table-body-mock-results");
        if (!tbody) return;

        tbody.innerHTML = "";
        allMockResultsData = [];
        
        let docs = [];
        snapshot.forEach(doc => docs.push(doc.data()));

        docs.sort((a, b) => {
            const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(0);
            const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(0);
            return dateB - dateA;
        });

        let count = 0;
        docs.forEach(data => {
            count++;
            
            let dateStr = "Unknown";
            if (data.timestamp) {
                if (data.timestamp.toDate) {
                    dateStr = data.timestamp.toDate().toLocaleString();
                } else if (data.timestamp instanceof Date) {
                    dateStr = data.timestamp.toLocaleString();
                } else {
                    dateStr = new Date(data.timestamp).toLocaleString();
                }
            }

            const status = data.status || "completed";
            let statusColor = "#64748b"; // default grey
            if (status === "completed") statusColor = "#10b981"; // green
            if (status === "in-progress") statusColor = "#f59e0b"; // orange
            if (status === "aborted" || status === "terminated") statusColor = "#ef4444"; // red

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="white-space: nowrap; color:var(--pluto-text-muted); font-size:0.85rem;">${dateStr}</td>
                <td><strong>${data.userName || "Guest"}</strong></td>
                <td><span style="background:var(--pluto-border); padding:0.25rem 0.5rem; border-radius:4px; font-size:0.8rem; text-transform:uppercase;">${data.companyId}</span></td>
                <td style="color:var(--pluto-blue); font-weight:bold;">${data.totalScore}</td>
                <td style="color:var(--pluto-text-muted);">${data.timeLeft}s</td>
                <td>
                    <span style="background-color: ${statusColor}15; color: ${statusColor}; border: 1px solid ${statusColor}33; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.7rem; text-transform: uppercase; font-weight: 800;">
                        ${status}
                    </span>
                </td>
            `;
            tbody.appendChild(tr);

            allMockResultsData.push({
                date: dateStr,
                user: data.userName || "Guest",
                company: data.companyId,
                score: data.totalScore,
                timeRemaining: data.timeLeft,
                status: status
            });
        });

        const totalMockEl = document.getElementById("stat-total-mock");
        // We let the global stats from fetchOverviewAndUsers persist unless we want to update it here
        // if (totalMockEl) totalMockEl.innerText = count; 

        if (count === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--text-muted);">No mock tests recorded yet.</td></tr>`;
        }

    } catch (e) {
        console.error("Error fetching mock results:", e);
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
    link.setAttribute("download", "aptiverse_users_export.csv");
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

document.getElementById("download-leaderboard-csv").addEventListener("click", () => {
    if (allLeaderboardData.length === 0) {
        alert("No leaderboard data available to download.");
        return;
    }

    let csvContent = "Rank,Game,Name,Score,Date\n";
    allLeaderboardData.forEach(entry => {
        const safeName = `"${entry.name.replace(/"/g, '""')}"`;
        const safeGame = `"${entry.game.replace(/"/g, '""')}"`;
        const safeScore = `"${entry.score.replace(/"/g, '""')}"`;
        const safeDate = `"${entry.date.replace(/"/g, '""')}"`;

        csvContent += `${entry.rank},${safeGame},${safeName},${safeScore},${safeDate}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const gameType = allLeaderboardData[0] ? allLeaderboardData[0].game : "mixed";
    link.setAttribute("download", `aptiverse_leaderboard_${gameType}.csv`);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

document.getElementById("download-feedback-csv").addEventListener("click", () => {
    if (allFeedbackData.length === 0) {
        alert("No feedback data available to download.");
        return;
    }

    let csvContent = "Date,Sender,Email,Category,Message\n";
    allFeedbackData.forEach(entry => {
        const safeDate = `"${entry.date.replace(/"/g, '""')}"`;
        const safeSender = `"${entry.sender.replace(/"/g, '""')}"`;
        const safeEmail = `"${entry.email.replace(/"/g, '""')}"`;
        const safeCategory = `"${entry.category.replace(/"/g, '""')}"`;
        const safeMessage = `"${entry.message.replace(/"/g, '""')}"`;

        csvContent += `${safeDate},${safeSender},${safeEmail},${safeCategory},${safeMessage}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "aptiverse_feedback_export.csv");
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

document.getElementById("download-ratings-csv").addEventListener("click", () => {
    if (allRatingsData.length === 0) {
        alert("No ratings data available to download.");
        return;
    }

    let csvContent = "Date,User,Rating,Comment\n";
    allRatingsData.forEach(entry => {
        const safeDate = `"${entry.date.replace(/"/g, '""')}"`;
        const safeUser = `"${entry.user.replace(/"/g, '""')}"`;
        const safeComment = `"${entry.comment.replace(/"/g, '""')}"`;

        csvContent += `${safeDate},${safeUser},${entry.rating},${safeComment}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "aptiverse_ratings_export.csv");
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

document.getElementById("download-mock-csv")?.addEventListener("click", () => {
    if (allMockResultsData.length === 0) {
        alert("No mock results available to download.");
        return;
    }

    let csvContent = "Date,Candidate,Company,Score,Time Remaining,Status\n";
    allMockResultsData.forEach(entry => {
        const safeDate = `"${entry.date.replace(/"/g, '""')}"`;
        const safeUser = `"${entry.user.replace(/"/g, '""')}"`;
        const safeCompany = `"${entry.company.replace(/"/g, '""')}"`;
        const safeScore = `"${entry.score}"`;
        const safeTime = `"${entry.timeRemaining}s"`;
        const safeStatus = `"${entry.status}"`;

        csvContent += `${safeDate},${safeUser},${safeCompany},${safeScore},${safeTime},${safeStatus}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "aptiverse_mock_results.csv");
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});
// --- RESET LEADERBOARDS LOGIC ---
const btnResetLeaderboards = document.getElementById("reset-leaderboards-btn");

if (btnResetLeaderboards) {
    btnResetLeaderboards.addEventListener("click", async () => {
        const confirmReset = confirm("CRITICAL ACTION: Are you sure you want to PERMANENTLY delete ALL leaderboard entries from all games? This cannot be undone.");
        
        if (!confirmReset) return;

        btnResetLeaderboards.innerText = "Clearing...";
        btnResetLeaderboards.disabled = true;

        try {
            const games = ["grid", "sudoku", "inductive", "motion", "switch", "di", "rc"];
            let totalDeleted = 0;

            for (const gameId of games) {
                btnResetLeaderboards.innerText = `Clearing ${gameId.toUpperCase()}...`;
                const q = query(collection(db, "leaderboards", gameId, "scores"));
                const snapshot = await getDocs(q);
                
                if (snapshot.empty) continue;

                // Use Firestore Batch for reliable deletion
                const batch = writeBatch(db);
                snapshot.forEach(scoreDoc => {
                    batch.delete(doc(db, "leaderboards", gameId, "scores", scoreDoc.id));
                });
                
                await batch.commit();
                totalDeleted += snapshot.size;
                console.log(`Deleted ${snapshot.size} entries from ${gameId}`);
            }

            alert(`Success! Successfully cleared ${totalDeleted} entries across all leaderboards.`);
            // Refresh the current view
            const currentGame = document.getElementById("leaderboard-filter").value;
            fetchLeaderboardData(currentGame);
        } catch (error) {
            console.error("Error resetting leaderboards:", error);
            alert("Error: Failed to clear leaderboards. Check console for details.");
        } finally {
            btnResetLeaderboards.innerHTML = '<i class="fas fa-trash-alt"></i> Reset All Leaderboards';
            btnResetLeaderboards.disabled = false;
        }
    });
}

// --- LOGIN HISTORY MODAL ---
function showLoginHistory(userId) {
    const user = allUsersData.find(u => u.id === userId);
    if (!user) return;

    document.getElementById("history-user-name").innerText = `${user.name}'s Login History`;
    const list = document.getElementById("history-list");
    list.innerHTML = "";

    if (!user.history || user.history.length === 0) {
        list.innerHTML = '<li class="history-item">No history recorded yet.</li>';
    } else {
        // Show last 50 logins reversed
        const historyToShow = [...user.history].reverse().slice(0, 50);
        historyToShow.forEach(iso => {
            const date = new Date(iso);
            const item = document.createElement("li");
            item.className = "history-item";
            item.innerHTML = `
                <span>${date.toLocaleDateString()}</span>
                <span style="color:var(--pluto-text-muted);">${date.toLocaleTimeString()}</span>
            `;
            list.appendChild(item);
        });
    }

    document.getElementById("login-history-modal").classList.remove("hidden");
}

document.getElementById("close-history-modal").onclick = () => {
    document.getElementById("login-history-modal").classList.add("hidden");
};

window.onclick = (event) => {
    const modal = document.getElementById("login-history-modal");
    if (event.target === modal) {
        modal.classList.add("hidden");
    }
};
// 6. Traffic Analytics
async function fetchTrafficData(range) {
    try {
        const now = new Date();
        let startTime;

        switch (range) {
            case "1h": startTime = new Date(now.getTime() - 60 * 60 * 1000); break;
            case "24h": startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
            case "7d": startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
            case "30d": startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
            default: startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }

        let snapshot;
        try {
            const q = query(
                collection(db, "traffic"),
                where("timestamp", ">=", Timestamp.fromDate(startTime)),
                orderBy("timestamp", "asc")
            );
            snapshot = await getDocs(q);
        } catch (indexError) {
            console.warn("Traffic index missing, falling back to client-side filter:", indexError);
            const allTraffic = await getDocs(collection(db, "traffic"));
            // Client-side filter and sort
            const filtered = [];
            allTraffic.forEach(doc => {
                const data = doc.data();
                const ts = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                if (ts >= startTime) filtered.push(data);
            });
            filtered.sort((a,b) => {
                const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
                const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
                return da - db;
            });
            processAndRenderTraffic(filtered, range);
            return;
        }

        const data = [];
        snapshot.forEach(doc => data.push(doc.data()));
        processAndRenderTraffic(data, range);

    } catch (e) {
        console.error("Error fetching traffic data:", e);
    }
}

function processAndRenderTraffic(data, range) {
    const visitsByTime = {};
    const uniqueByTime = {};
    
    // Grouping logic based on range
    data.forEach(item => {
        let date = new Date(0);
        if (item.timestamp) {
            if (item.timestamp.toDate) date = item.timestamp.toDate();
            else if (item.timestamp instanceof Date) date = item.timestamp;
            else date = new Date(item.timestamp);
        }

        let label;
        if (range === "1h") {
            label = date.toLocaleTimeString([], { minute: '2-digit' });
        } else if (range === "24h") {
            label = date.getHours() + ":00";
        } else {
            label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }

        visitsByTime[label] = (visitsByTime[label] || 0) + 1;
        if (item.isNew) {
            uniqueByTime[label] = (uniqueByTime[label] || 0) + 1;
        }
    });

    const labels = Object.keys(visitsByTime);
    const visitCounts = Object.values(visitsByTime);
    const uniqueCounts = labels.map(l => uniqueByTime[l] || 0);

    // Update Mini Stats
    const totalVisits = data.length;
    const uniqueVisitors = new Set(data.map(d => d.visitorId)).size;
    const repeatRate = totalVisits > 0 ? Math.round(((totalVisits - uniqueVisitors) / totalVisits) * 100) : 0;

    document.getElementById("traffic-total-visits").innerText = totalVisits;
    document.getElementById("traffic-unique-visitors").innerText = uniqueVisitors;
    document.getElementById("traffic-repeat-rate").innerText = repeatRate + "%";

    renderTrafficChart(labels, visitCounts, uniqueCounts);
}

function renderTrafficChart(labels, visitCounts, uniqueCounts) {
    const ctx = document.getElementById('trafficChart').getContext('2d');
    
    if (trafficChart) {
        trafficChart.destroy();
    }

    trafficChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Total Visits',
                    data: visitCounts,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#6366f1'
                },
                {
                    label: 'Unique Visitors',
                    data: uniqueCounts,
                    borderColor: '#c90076',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#c90076'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        color: '#f1f5f9',
                        font: { family: "'Outfit', sans-serif", size: 12, weight: '600' }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#1e293b',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    titleFont: { size: 14, weight: '700' },
                    bodyFont: { size: 13 },
                    cornerRadius: 12
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { 
                        color: '#94a3b8',
                        font: { family: "'Outfit', sans-serif", size: 11 } 
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { 
                        color: '#94a3b8',
                        font: { family: "'Outfit', sans-serif", size: 11 } 
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}
