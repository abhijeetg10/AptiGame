import { collection, addDoc, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { initRatingSystem } from "./rating-system.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";
import { GAME_CONFIG } from "./game-constants.js";
import { Logger } from "./logger.js";

// --- Constants & Config ---
const { TOTAL_MODULES, LEVELS_PER_MODULE, MODULE_TIME_LIMIT, POINTS_PER_CORRECT } = GAME_CONFIG;

// --- State Variables ---
let highestUnlockedModule = 5;
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
    const user = auth.currentUser;
    if (user) {
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
                const data = userSnap.data();
                if (data.highestModule_di) {
                    highestUnlockedModule = Math.max(5, data.highestModule_di);
                }
            }
        } catch (e) { console.error(e); }
    }
    initModuleGrid();
}

function initModuleGrid() {
    const modules = [
        { id: 1, name: "Module 1", desc: "Basic Data Retrieval", color: "linear-gradient(135deg, #3b82f6, #60a5fa)" },
        { id: 2, name: "Module 2", desc: "Trend Analysis", color: "linear-gradient(135deg, #10b981, #34d399)" },
        { id: 3, name: "Module 3", desc: "Comparative Logic", color: "linear-gradient(135deg, #f59e0b, #fbbf24)" },
        { id: 4, name: "Module 4", desc: "Advanced Synthesis", color: "linear-gradient(135deg, #8b5cf6, #a78bfa)" },
        { id: 5, name: "Module 5", desc: "Elite Interpretation", color: "linear-gradient(135deg, #ef4444, #f87171)" }
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

// initModuleGrid() will be called from loadUserProgress()

// --- Data Generation Engine ---
// --- Data Generation Engine ---
function generateLevelData() {
    const companies = ['A', 'B', 'C', 'D', 'E'];
    const years = [2021, 2022];
    
    // Core data titles (Generic but descriptive)
    const titles = [
        "Annual Production & Export Summary",
        "Quarterly Manufacturing Yields",
        "International Logistics Report",
        "Unit Distribution Metrics",
        "Global Resource Allocation",
        "Industrial Output Analysis"
    ];

    const tabs = [];

    for (let i = 0; i < 6; i++) {
        const type = i < 3 ? 'table' : 'chart';
        const headers = ['Company', 'Production 2021', '% Exported 2021', 'Production 2022', '% Exported 2022'];
        
        const rows = companies.map(comp => {
            const row = { label: comp };
            // Production in thousands (100 to 200)
            row['Production 2021'] = Math.floor(Math.random() * 11) * 10 + 100;
            row['% Exported 2021'] = Math.floor(Math.random() * 7) * 5 + 15; // 15% to 45%
            row['Production 2022'] = row['Production 2021'] + (Math.floor(Math.random() * 5) * 10 + 10); // Growth
            row['% Exported 2022'] = row['% Exported 2021'] + (Math.floor(Math.random() * 3) * 5); // Growth in %
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
            // For charts, we use specific values
            values: headers.slice(1).map(() => Math.floor(Math.random() * 1000) + 200)
        });
    }

    const questionTab = Math.floor(Math.random() * 6);
    const selectedTab = tabs[questionTab];
    let questionText = "";
    let solution = "";

    const roll = Math.random();
    
    if (roll < 0.25) {
        // Q1 style: Absolute units exported
        const companyIdx = Math.floor(Math.random() * companies.length);
        const row = selectedTab.rows[companyIdx];
        const year = 2022;
        const prod = row[`Production ${year}`];
        const expPct = row[`% Exported ${year}`];
        const actualExports = (prod * expPct / 100) * 1000;
        
        const isCorrect = Math.random() > 0.5;
        const displayVal = isCorrect ? actualExports : actualExports + (Math.random() > 0.5 ? 5000 : -5000);
        
        questionText = `Is the total number of units exported by Company ${row.label} in ${year} exactly ${displayVal.toLocaleString()}?`;
        solution = isCorrect ? "Yes" : "No";
    } else if (roll < 0.50) {
        // Q2 style: Difference in exports
        const companyIdx = Math.floor(Math.random() * companies.length);
        const row = selectedTab.rows[companyIdx];
        const exp21 = (row['Production 2021'] * row['% Exported 2021'] / 100) * 1000;
        const exp22 = (row['Production 2022'] * row['% Exported 2022'] / 100) * 1000;
        const diff = Math.abs(exp22 - exp21);
        
        const isCorrect = Math.random() > 0.5;
        const displayVal = isCorrect ? diff : diff + 3000;
        
        questionText = `Is the difference in units exported for Company ${row.label} between 2021 and 2022 approx ${displayVal.toLocaleString()}?`;
        solution = isCorrect ? "Yes" : "No";
    } else if (roll < 0.75) {
        // Q3 style: Maximum increase
        let maxInc = -1;
        let bestComp = "";
        selectedTab.rows.forEach(r => {
            const e21 = (r['Production 2021'] * r['% Exported 2021'] / 100);
            const e22 = (r['Production 2022'] * r['% Exported 2022'] / 100);
            const inc = e22 - e21;
            if (inc > maxInc) {
                maxInc = inc;
                bestComp = r.label;
            }
        });
        
        const isCorrect = Math.random() > 0.5;
        const targetComp = isCorrect ? bestComp : companies.find(c => c !== bestComp);
        
        questionText = `Based on the latest reports, did Company ${targetComp} show the maximum increase in exported units from 2021 to 2022?`;
        solution = isCorrect ? "Yes" : "No";
    } else {
        // Q5 style: Total Percentage exported in 2022
        let totalProd = 0;
        let totalExp = 0;
        selectedTab.rows.forEach(r => {
            totalProd += r['Production 2022'];
            totalExp += (r['Production 2022'] * r['% Exported 2022'] / 100);
        });
        const totalPct = Math.round((totalExp / totalProd) * 100);
        
        const isCorrect = Math.random() > 0.5;
        const displayPct = isCorrect ? totalPct : totalPct + 5;
        
        questionText = `Does the analysis confirm that approx ${displayPct}% of the total production across all entities was exported in 2022?`;
        solution = isCorrect ? "Yes" : "No";
    }

    return { tabs, questionText, solution };
}

// --- Rendering Logic ---
function renderTabs() {
    elTabContainer.innerHTML = '';
    currentData.tabs.forEach((tab, index) => {
        const card = document.createElement('div');
        card.className = 'data-card';
        card.innerHTML = `
            <i class="fas fa-folder card-icon"></i>
            <div class="card-label">DATA</div>
            <div class="card-title">${tab.title}</div>
        `;
        card.onclick = () => {
            activeTab = index;
            toggleDataView(true);
            renderActiveTabData();
        };
        elTabContainer.appendChild(card);
    });
}

function toggleDataView(showData) {
    if (showData) {
        elTabContainer.style.display = 'none';
        elDataViewerContainer.style.display = 'flex';
        elAnswerBar.style.display = 'flex';
    } else {
        elTabContainer.style.display = 'grid';
        elDataViewerContainer.style.display = 'none';
        elAnswerBar.style.display = 'none';
    }
}
window.toggleDataView = toggleDataView;

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
window.startModule = (mod) => {
    currentModule = mod;
    currentLevel = 1;
    score = 0;
    correctAnswers = 0;
    timeLeft = MODULE_TIME_LIMIT;
    
    elModuleSelection.classList.add('hidden');
    elResultsModal.classList.add('hidden');
    elGameContainer.classList.remove('hidden');
    elGameHeader.classList.remove('hidden');
    
    elModule.innerText = `${currentModule} / 5`;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;
    elScore.innerText = score;
    
    nextLevel();
    if (!isMock) startTimer();
    else if (elTimer) elTimer.style.display = 'none';
};

function nextLevel() {
    if (currentLevel > LEVELS_PER_MODULE) {
        endGame();
        return;
    }
    toggleDataView(false);
    currentData = generateLevelData();
    currentSolution = currentData.solution;
    elQuestion.innerHTML = currentData.questionText;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;
    document.getElementById('level-indicator').innerText = `Q${currentLevel}`;
    renderTabs();
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
    }, 1500); // Slightly longer delay to see the feedback
};

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        elTimer.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        if (timeLeft <= 0) endGame();
    }, 1000);
}

async function endGame() {
    clearInterval(timerInterval);
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
        } catch (lbError) {
            console.warn("DI leaderboard save failed (Permissions?):", lbError);
        }
    }

    elNextModuleBtn.onclick = () => {
        if (currentModule < 5) startModule(currentModule + 1);
        else window.location.href = 'index.html';
    };

    if (isMock) {
        window.parent.postMessage({ type: 'MODULE_COMPLETE', score: score }, '*');
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
