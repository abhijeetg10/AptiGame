import { collection, addDoc, doc, getDoc, setDoc, onAuthStateChanged, db, auth, increment, serverTimestamp } from "./db-shim.js";
import { GAME_CONFIG } from "./game-constants.js";
import { Logger } from "./logger.js";
import { getISOWeekString } from "./utils.js";

// --- Constants & Config ---
const { TOTAL_MODULES, LEVELS_PER_MODULE, MODULE_TIME_LIMIT, POINTS_PER_CORRECT } = GAME_CONFIG;

// --- State Variables ---
let highestUnlockedModule = 10;
let currentModule = 1;
let currentLevel = 1;
let score = 0;
let correctAnswers = 0;
let timeLeft = MODULE_TIME_LIMIT;
let timerInterval = null;
const isMock = new URLSearchParams(window.location.search).get('mode') === 'mock';
let currentData = null; // Stores data for 6 tabs
let currentSolution = null; // The correct answer (Yes/No/Cant Say)
let activeTab = 0;
let chartInstance = null;

const sounds = {
    correct: new Audio('assets/sounds/correct.mp3'),
    wrong: new Audio('assets/sounds/wrong.mp3')
};

// --- DOM Elements ---
// --- DOM Elements ---
const elTimer = document.getElementById('timer-display');
const elScore = document.getElementById('score-display');
const elLevel = document.getElementById('level-display');
const elModule = document.getElementById('module-display');
const elQuestion = document.getElementById('question-text');
const elTabContainer = document.getElementById('cards-grid'); 
const elDataViewer = document.getElementById('tab-data-viewer');
const elDataViewerContainer = document.getElementById('data-viewer');
const elAnswerBar = document.getElementById('answer-bar');
const elModuleSelection = document.getElementById('module-selection');
const elResultsModal = document.getElementById('results-modal');
const elGameContainer = document.getElementById('game-container');
const elGameHeader = document.getElementById('game-header');
const elModuleGrid = document.getElementById('module-grid');

const elModalTitle = document.getElementById('modal-title');
const elScoreText = document.getElementById('score-text');
const elFinalMarks = document.getElementById('final-marks-val');
const elAccuracyText = document.getElementById('accuracy-text');
const elNextModuleBtn = document.getElementById('next-module-btn');
const elBackToModulesBtn = document.getElementById('back-to-modules-btn');

// --- Initialization ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        loadUserProgress();
    }
});

// Fetch user progress
async function loadUserProgress() {
    highestUnlockedModule = 10; // Forced unlock
    const user = auth.currentUser;
    if (user) {
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
                const data = userSnap.data();
                // highestUnlockedModule = data.highestUnlockedModuleDI || 1;
            }
        } catch (e) {
            console.error("Error loading progress:", e);
        }
    }
    
    if (isMock) {
        startModule(1);
        if (elModuleSelection) elModuleSelection.style.display = 'none';
        if (elGameContainer) elGameContainer.classList.remove('hidden');
    } else {
        initModuleGrid();
    }
}

function initModuleGrid() {
    const modules = [
        { id: 1, name: "Module 1", desc: "Basic Data Retrieval", color: "linear-gradient(135deg, #3b82f6, #60a5fa)" },
        { id: 2, name: "Module 2", desc: "Trend Analysis", color: "linear-gradient(135deg, #10b981, #34d399)" },
        { id: 3, name: "Module 3", desc: "Comparative Logic", color: "linear-gradient(135deg, #f59e0b, #fbbf24)" },
        { id: 4, name: "Module 4", desc: "Advanced Synthesis", color: "linear-gradient(135deg, #8b5cf6, #a78bfa)" },
        { id: 5, name: "Module 5", desc: "Elite Interpretation", color: "linear-gradient(135deg, #ef4444, #f87171)" },
        { id: 6, name: "Module 6", desc: "Statistical Mastery", color: "linear-gradient(135deg, #c90076, #ff4b2b)" },
        { id: 7, name: "Module 7", desc: "Predictive Analysis", color: "linear-gradient(135deg, #2563eb, #3b82f6)" },
        { id: 8, name: "Module 8", desc: "Data Correlation", color: "linear-gradient(135deg, #059669, #10b981)" },
        { id: 9, name: "Module 9", desc: "Pattern Visualization", color: "linear-gradient(135deg, #d97706, #f59e0b)" },
        { id: 10, name: "Module 10", desc: "AptiVerse DI Titan", color: "linear-gradient(135deg, #4f46e5, #6366f1)" }
    ];

    elModuleGrid.innerHTML = '';
    modules.forEach(m => {
        const card = document.createElement('div');
        card.className = "card module-card";
        
        const isLocked = m.id > highestUnlockedModule;
        card.style.cursor = isLocked ? "not-allowed" : "pointer";
        card.style.opacity = isLocked ? "0.5" : "1";
        card.title = isLocked ? "Complete previous modules to unlock" : "Click to play";

        card.innerHTML = `
            <div class="card-img" style="height: 140px; background: ${m.color}; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 4rem; font-weight: 800; color: white; opacity: 0.9;">${m.id}</span>
            </div>
            <div class="card-content">
                <h3>${m.name}</h3>
                <p>${m.desc}</p>
            </div>
        `;
        if (!isLocked) {
            card.onclick = () => startModule(m.id);
        }
        elModuleGrid.appendChild(card);
    });
}

// Global roomId and role from URL
window.roomId = new URLSearchParams(window.location.search).get('roomId');
window.duelRole = new URLSearchParams(window.location.search).get('role');

// --- DUEL LOGIC ---
function initDuelMode() {
    console.log("Duel Mode Initialized:", window.roomId, window.duelRole);
    const vsBar = document.getElementById('duel-vs-bar');
    if (vsBar) {
        vsBar.classList.remove('hidden');
        vsBar.style.display = 'flex';
    }

    const roomRef = doc(db, "rooms", window.roomId);
    onSnapshot(roomRef, (snap) => {
        if (!snap.exists()) {
            alert("Room closed.");
            window.location.href = "duel.html";
            return;
        }
        const data = snap.data();
        
        // Update Names/Scores
        document.getElementById('p1-duel-name').innerText = data.hostName;
        document.getElementById('p1-duel-score').innerText = data.hostScore || 0;
        document.getElementById('p2-duel-name').innerText = (data.guestName || "Waiting...") + (data.status === 'ready' ? ' (READY)' : '');
        document.getElementById('p2-duel-score').innerText = data.guestScore || 0;
    });

    // Automatically start first module if in duel
    setTimeout(() => startModule(1), 1000);
}

async function updateDuelScore() {
    if (!window.roomId) return;
    const roomRef = doc(db, "rooms", window.roomId);
    const scoreField = window.duelRole === 'host' ? 'hostScore' : 'guestScore';
    try {
        await updateDoc(roomRef, { [scoreField]: score });
    } catch (e) {
        console.error("Duel score sync failed:", e);
    }
}

// --- Data Generation Engine ---
function generateDataResources() {
    const companies = ['A', 'B', 'C', 'D', 'E'];
    const titles = [
        "Annual Output & Export Distribution",
        "Quarterly Manufacturing Statistics",
        "International Shipping & Logistics",
        "Regional Unit Metrics",
        "Global Resource Management",
        "Industrial Productivity Analysis"
    ];

    const tabs = [];

    for (let i = 0; i < 6; i++) {
        const type = i < 3 ? 'table' : 'chart';
        const headers = ['Company', 'Units 2021', '% Exported (21)', 'Units 2022', '% Exported (22)'];
        
        const rows = companies.map(comp => {
            const row = { label: comp };
            row['Units 2021'] = Math.floor(Math.random() * 10) * 20 + 100;
            row['% Exported (21)'] = Math.floor(Math.random() * 5) * 10 + 10;
            row['Units 2022'] = row['Units 2021'] + 20;
            row['% Exported (22)'] = row['% Exported (21)'] + 10;
            return row;
        });

        tabs.push({
            id: i,
            title: titles[i],
            type: type,
            headers: headers,
            rows: rows,
            chartType: type === 'chart' ? (i === 3 ? 'bar' : (i === 4 ? 'line' : 'pie')) : null,
            labels: headers.slice(1),
            values: headers.slice(1).map(() => Math.floor(Math.random() * 1000) + 200)
        });
    }
    return tabs;
}

function generateQuestionFromResources(tabs, level) {
    const companies = ['A', 'B', 'C', 'D', 'E'];
    // 3 questions per tab, total 18 questions
    const questionTab = Math.min(5, Math.floor((level - 1) / 3)); 
    const selectedTab = tabs[questionTab];
    let questionText = "";
    let solution = "";

    const roll = Math.random();
    
    if (roll < 0.3) {
        const companyIdx = Math.floor(Math.random() * companies.length);
        const row = selectedTab.rows[companyIdx];
        const val = row[`Units 2022`];
        const isCorrect = Math.random() > 0.4;
        const displayVal = isCorrect ? val : val + 15;
        questionText = `According to the <strong>Tab ${questionTab + 1}</strong> data, did Company ${row.label} produce exactly ${displayVal} units in 2022?`;
        solution = isCorrect ? "Yes" : "No";
    } else if (roll < 0.6) {
        const companyIdx = Math.floor(Math.random() * companies.length);
        const row = selectedTab.rows[companyIdx];
        const pct = row['% Exported (22)'];
        const isCorrect = Math.random() > 0.4;
        const displayPct = isCorrect ? pct : pct + 5;
        questionText = `Does <strong>Tab ${questionTab + 1}</strong> confirm that Company ${row.label} exported ${displayPct}% of its units in 2022?`;
        solution = isCorrect ? "Yes" : "No";
    } else if (roll < 0.85) {
        const c1 = selectedTab.rows[0];
        const c2 = selectedTab.rows[1];
        const isHigher = c1['Units 2022'] > c2['Units 2022'];
        const isCorrect = Math.random() > 0.5;
        const targetResult = isCorrect ? (isHigher ? "more" : "fewer") : (isHigher ? "fewer" : "more");
        questionText = `In <strong>Tab ${questionTab + 1}</strong>, did Company ${c1.label} produce ${targetResult} units than Company ${c2.label} in 2022?`;
        solution = isCorrect ? "Yes" : "No";
    } else {
        let total22 = 0;
        selectedTab.rows.forEach(r => total22 += r['Units 2022']);
        const isCorrect = Math.random() > 0.5;
        const displaySum = isCorrect ? total22 : total22 + 50;
        questionText = `Based on <strong>Tab ${questionTab + 1}</strong>, is the total combined production for all companies in 2022 equal to ${displaySum} units?`;
        solution = isCorrect ? "Yes" : "No";
    }

    return { questionText, solution };
}

// --- Rendering Logic ---
function renderResourceTabs() {
    const elResourceTabs = document.getElementById('resource-tabs');
    elResourceTabs.innerHTML = '';
    currentDataResources.forEach((tab, index) => {
        const tabEl = document.createElement('div');
        tabEl.className = `res-tab ${activeTab === index ? 'active' : ''}`;
        
        let iconClass = 'fa-table';
        if (tab.chartType === 'bar') iconClass = 'fa-chart-bar';
        if (tab.chartType === 'line') iconClass = 'fa-chart-line';
        if (tab.chartType === 'pie') iconClass = 'fa-chart-pie';

        tabEl.innerHTML = `
            <i class="fas ${iconClass}"></i>
            <span class="res-tab-num">TAB ${index + 1}</span>
        `;
        tabEl.onclick = () => {
            activeTab = index;
            renderResourceTabs();
            renderActiveTabData();
        };
        elResourceTabs.appendChild(tabEl);
    });
}

function renderActiveTabData() {
    const data = currentData.tabs[activeTab];
    elDataViewer.innerHTML = '';
    if (chartInstance) chartInstance.destroy();

    if (data.type === 'table') {
        let h = `<table class="di-table"><thead><tr>`;
        data.headers.forEach(head => h += `<th>${head}</th>`);
        h += `</tr></thead><tbody>`;
        data.rows.forEach(r => {
            h += `<tr><td><strong>${r.label}</strong></td>`;
            data.headers.slice(1).forEach(head => {
                h += `<td>${r[head]}</td>`;
            });
            h += `</tr>`;
        });
        h += `</tbody></table>`;
        elDataViewer.innerHTML = h;
    } else {
        const canvas = document.createElement('canvas');
        canvas.id = 'diChart';
        canvas.style.height = '400px';
        elDataViewer.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        chartInstance = new Chart(ctx, {
            type: data.chartType,
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Volume',
                    data: data.values,
                    backgroundColor: ['#3b82f6', '#60a5fa', '#3b82f6', '#1e3a8a'],
                    borderColor: '#1e3a8a',
                    borderWidth: 1
                }]
            },
            options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: '#1e3a8a' } } } }
        });
    }
}

// --- Game Flow ---
let currentDataResources = null;

window.startModule = (mod) => {
    currentModule = mod;
    currentLevel = 1;
    score = 0;
    correctAnswers = 0;
    timeLeft = MODULE_TIME_LIMIT;
    activeTab = 0;
    
    // Check for Duel Mode
    if (window.roomId) {
        initDuelMode();
    }
    
    currentDataResources = generateDataResources();

    elModuleSelection.classList.add('hidden');
    elResultsModal.classList.add('hidden');
    elGameContainer.classList.remove('hidden');
    elGameHeader.classList.remove('hidden');
    elAnswerBar.style.display = 'flex';
    
    elModule.innerText = `${currentModule}`;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;
    elScore.innerText = score;
    
    renderResourceTabs();
    renderActiveTabData();
    nextLevel();
    if (!isMock) startTimer();
    else if (elTimer) elTimer.style.display = 'none';
};

function nextLevel() {
    if (currentLevel > LEVELS_PER_MODULE) {
        endGame();
        return;
    }
    
    // Auto sync active tab to the relevant one for the level (3 questions per tab)
    activeTab = Math.min(5, Math.floor((currentLevel - 1) / 3));
    renderResourceTabs();
    renderActiveTabData();

    const qData = generateQuestionFromResources(currentDataResources, currentLevel);
    currentSolution = qData.solution;
    elQuestion.innerHTML = qData.questionText;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;
    document.getElementById('level-indicator').innerText = `Q${currentLevel}`;
}

window.handleAnswer = (ans) => {
    // Disable all buttons immediately to prevent multiple clicks
    const buttons = document.querySelectorAll('.ans-btn');
    buttons.forEach(btn => btn.style.pointerEvents = 'none');

    // Find the clicked button
    const clickedBtn = Array.from(buttons).find(btn => {
        const btnText = btn.innerText.toLowerCase().replace(/['’]/g, "");
        const searchText = ans.toLowerCase().replace(/['’]/g, "");
        return btnText.includes(searchText);
    });

    if (ans === currentSolution) {
        score += POINTS_PER_CORRECT;
        correctAnswers++;
        updateDuelScore(); // Sync duel progress
        sounds.correct.play().catch(() => {});
        if (clickedBtn) clickedBtn.classList.add('correct');
        showFeedbackPopup("CORRECT!", "+3 MARKS", "#22c55e");
    } else {
        sounds.wrong.play().catch(() => {});
        if (clickedBtn) clickedBtn.classList.add('incorrect');
        
        showFeedbackPopup(`WRONG!<br><span style="font-size: 0.9rem; opacity: 0.8; font-weight: 500;">Answer: ${currentSolution}</span>`, "", "#ef4444");

        // Also highlight the correct one after a short delay
        setTimeout(() => {
            const correctBtn = Array.from(buttons).find(btn => {
                const btnText = btn.innerText.toLowerCase().replace(/['’]/g, "");
                const searchText = currentSolution.toLowerCase().replace(/['’]/g, "");
                return btnText.includes(searchText);
            });
            if (correctBtn) correctBtn.classList.add('correct');
        }, 500);
    }
    
    currentLevel++;
    setTimeout(() => {
        // Reset buttons for next level
        buttons.forEach(btn => {
            btn.classList.remove('correct', 'incorrect');
            btn.style.pointerEvents = 'auto';
        });
        nextLevel();
    }, 1200); // Standardized delay
};

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (timeLeft <= 0) {
            timeLeft = 0;
            clearInterval(timerInterval);
            endGame();
            updateTimerDisplay();
            return;
        }
        timeLeft--;
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const displayTime = Math.max(0, timeLeft);
    const mins = Math.floor(displayTime / 60);
    const secs = displayTime % 60;
    elTimer.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function endGame() {
    clearInterval(timerInterval);
    ActivityLogger.log('solve', 'di');
    if (isMock) {
        window.parent.postMessage({ type: 'MODULE_COMPLETE', score: score }, '*');
        return;
    }
    const ratingContainer = document.getElementById('rating-section');
    if (ratingContainer) initRatingSystem(ratingContainer);

    elResultsModal.classList.remove('hidden');
    elScoreText.innerText = `${correctAnswers} / ${LEVELS_PER_MODULE}`;
    elFinalMarks.innerText = score;
    elAccuracyText.innerText = `${Math.round((correctAnswers / LEVELS_PER_MODULE) * 100)}%`;

    // Add LinkedIn Share Button
    let linkedinBtn = document.getElementById('linkedin-share-btn');
    if (!linkedinBtn) {
        linkedinBtn = document.createElement('button');
        linkedinBtn.id = 'linkedin-share-btn';
        linkedinBtn.className = 'btn btn-outline';
        linkedinBtn.style.marginTop = '0.5rem';
        linkedinBtn.style.width = '100%';
        linkedinBtn.innerHTML = '<i class="fab fa-linkedin"></i> Share on LinkedIn';
        linkedinBtn.onclick = () => {
            const text = `I just completed DI Challenge Module ${currentModule} on AptiVerse with ${correctAnswers}/${LEVELS_PER_MODULE} correct! 🚀 #AptitudeReasoning #AptiVerse`;
            const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`;
            window.open(url, '_blank', 'width=600,height=400');
        };
        elResultsModal.querySelector('.modal-content').appendChild(linkedinBtn);
    }
    const user = auth.currentUser;
    if (user) {
        // 1. PRIORITIZE PROGRESSION
        try {
            const moduleReached = Math.min(TOTAL_MODULES, currentModule + 1);
            if (moduleReached > highestUnlockedModule) {
                highestUnlockedModule = moduleReached;
                await setDoc(doc(db, "users", user.uid), {
                    highestModule_di: moduleReached
                }, { merge: true });
                console.log("DI progression saved.");
            }
        } catch (progError) {
            console.error("DI progression save failed:", progError);
        }

        // 2. ATTEMPT LEADERBOARD (Non-blocking)
        try {
            const scoreRef = doc(db, "leaderboards", "di", "scores", user.uid);
            const scoreSnap = await getDoc(scoreRef);
            
            let existingModuleScores = {};
            if (scoreSnap.exists()) {
                const oldData = scoreSnap.data();
                if (oldData.moduleScores) {
                    existingModuleScores = oldData.moduleScores;
                } else if (typeof oldData.score === "number") {
                    existingModuleScores["1"] = oldData.score; // Migration
                }
            }

            if (existingModuleScores[currentModule] === undefined || score > existingModuleScores[currentModule]) {
                existingModuleScores[currentModule] = score;
            }

            let totalScore = 0;
            let totalPossible = 0;
            for (const mod in existingModuleScores) {
                totalScore += existingModuleScores[mod];
                totalPossible += LEVELS_PER_MODULE; 
            }

            await setDoc(scoreRef, {
                name: user.displayName || "Guest Player",
                score: totalScore,
                totalLevels: totalPossible,
                moduleScores: existingModuleScores,
                metrics: { correctAnswers, timeSpent: MODULE_TIME_LIMIT - timeLeft },
                timestamp: new Date()
            }, { merge: true });
            console.log("DI leaderboard updated.");
            // DENORMALIZATION
            const userDocRef = doc(db, "users", user.uid);
            const updateField = `gameScores.${isMock ? 'mock_' : ''}di`;
            await setDoc(userDocRef, {
                totalScore: increment(score),
                modulesCompleted: increment(1),
                [updateField]: increment(score),
                lastPlayed: new Date()
            }, { merge: true });

            // 3. WEEKLY LEADERBOARD (New)
            try {
                const weekId = getISOWeekString();
                const weeklyRef = doc(db, "weekly_leaderboards", weekId, "scores", user.uid);
                await setDoc(weeklyRef, {
                    name: user.displayName || "Guest Player",
                    score: increment(score),
                    timestamp: serverTimestamp()
                }, { merge: true });
            } catch (weeklyError) {
                console.warn("Weekly leaderboard save failed:", weeklyError);
            }

            // 4. COLLEGE LEADERBOARD (New)
            try {
                const userSnap = await getDoc(doc(db, "users", user.uid));
                if (userSnap.exists() && userSnap.data().college) {
                    const collegeName = userSnap.data().college;
                    const collegeId = collegeName.toLowerCase().trim().replace(/\s+/g, '_');
                    const collRef = doc(db, "colleges_leaderboard", collegeId);
                    await setDoc(collRef, {
                        displayName: collegeName,
                        totalScore: increment(score),
                        timestamp: serverTimestamp()
                    }, { merge: true });

                    // Also update college in the individual score entry for filtering
                    await setDoc(scoreRef, { college: collegeName }, { merge: true });
                }
            } catch (collError) {
                console.warn("College leaderboard update failed:", collError);
            }
        } catch (lbError) {
            console.warn("DI leaderboard save failed (Permissions?):", lbError);
        }
    }

    elNextModuleBtn.onclick = () => {
        if (currentModule < TOTAL_MODULES) startModule(currentModule + 1);
        else window.location.href = 'index.html';
    };

    if (isMock) {
        window.parent.postMessage({ type: 'MODULE_COMPLETE', score: score }, '*');
        return;
    }
}

if (elBackToModulesBtn) {
    elBackToModulesBtn.onclick = (e) => {
        e.preventDefault();
        clearInterval(timerInterval);
        elGameContainer.classList.add('hidden');
        elGameHeader.classList.add('hidden');
        elModuleSelection.classList.remove('hidden');
    };
}

function showFeedbackPopup(status, points, color) {
    const popup = document.getElementById('feedback-popup');
    const statusEl = document.getElementById('feedback-status');
    const pointsEl = document.getElementById('feedback-points');
    statusEl.innerText = status;
    statusEl.style.color = color;
    pointsEl.innerText = points;
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('hidden'), 1000);
}
