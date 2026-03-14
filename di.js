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
function generateLevelData() {
    const companies = ['P', 'Q', 'R', 'S', 'T'];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const years = [1995, 1996, 1997, 1998, 1999, 2000];
    
    const allTitles = [
        ["Product Sales by Day", "Regional Performance Summary", "State-wise Candidate Stats", "Demographic Success Rates", "Category-wise Participation", "Historical Enrollment Trends"],
        ["Quarterly Revenue Analysis", "Sales Growth Metrics", "Profit Margin Summary", "Qualified Candidates Over Time", "Product Category Performance", "Marketing ROI Breakdown"],
        ["User Engagement Stats", "Active User Retention", "Traffic Sources Overview", "Device Usage Statistics", "Bounce Rate Comparison", "Feature Adoption Report"],
        ["Global Market Share", "Competitor Comparison", "Export/Import Volume", "Tariff Impact Study", "Supply Chain Efficiency", "Logistics Performance Index"],
        ["Employee Productivity", "HR Attrition Rates", "Departmental Budgeting", "Training ROI Analysis", "Shift Distribution Data", "Employee Feedback Summary"]
    ];

    const titles = allTitles[currentModule - 1] || allTitles[0];
    const tabs = [];

    for (let i = 0; i < 6; i++) {
        const type = i < 3 ? 'table' : 'chart';
        const isSales = titles[i].toLowerCase().includes("sales") || titles.indexOf(titles[i]) === 0;
        const isCandidates = titles[i].toLowerCase().includes("candidate") || titles[i].toLowerCase().includes("qualified");
        
        const headers = isSales ? ['Entity', ...days] : (isCandidates ? ['Day/Year', ...years] : ['Region', 'North', 'South', 'East', 'West']);
        const rowLabels = isSales ? companies : (isCandidates ? ['Qualified', 'Appeared'] : ['Electronics', 'Clothing', 'Groceries', 'Automotive', 'Beauty']);
        
        const rows = rowLabels.map(label => {
            const row = { label };
            headers.slice(1).forEach(h => {
                // Ensure some values are equal for "same pair" questions
                row[h] = Math.floor(Math.random() * 8) * 50 + 100; 
            });
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

    const questionTab = Math.floor(Math.random() * 6);
    const selectedTab = tabs[questionTab];
    let questionText = "";
    let solution = "";

    if (selectedTab.type === 'table') {
        const roll = Math.random();
        
        if (roll < 0.33) {
            // "P and S together on Thursday is what percent of T on Saturday?" style
            const h1 = selectedTab.headers[1 + Math.floor(Math.random() * (selectedTab.headers.length - 1))];
            const h2 = selectedTab.headers[1 + Math.floor(Math.random() * (selectedTab.headers.length - 1))];
            const r1 = selectedTab.rows[0];
            const r2 = selectedTab.rows[3 % selectedTab.rows.length];
            const r3 = selectedTab.rows[selectedTab.rows.length - 1];
            
            const sum = r1[h1] + r2[h1];
            const target = r3[h2];
            const percent = Math.round((sum / target) * 100);
            
            questionText = `In "${selectedTab.title}", is the ${selectedTab.rows[0].label} and ${selectedTab.rows[3 % selectedTab.rows.length].label} together on ${h1} approx ${percent}% of ${r3.label} on ${h2}?`;
            solution = "Yes";
        } else if (roll < 0.66) {
            // "Were 1995 and 1997 the pair of years in which qualified was same?" style
            const row = selectedTab.rows[0];
            const h1 = selectedTab.headers[1];
            const h2 = selectedTab.headers[3 % (selectedTab.headers.length - 1) + 1];
            
            const isSame = row[h1] === row[h2];
            questionText = `In dataset "${selectedTab.title}", are ${h1} and ${h2} the pair of columns where ${row.label} value is the same?`;
            solution = isSame ? "Yes" : "No";
        } else {
            const randomRow = selectedTab.rows[Math.floor(Math.random() * selectedTab.rows.length)];
            const h = selectedTab.headers[1];
            questionText = `Does the dataset "${selectedTab.title}" show that ${randomRow.label} ${h} value exceeds 500?`;
            solution = randomRow[h] > 500 ? "Yes" : "No";
        }
    } else {
        // Chart questions
        const roll = Math.random();
        if (roll < 0.5) {
            questionText = `In the "${selectedTab.title}" chart, is the value for ${selectedTab.labels[selectedTab.labels.length-1]} higher than ${selectedTab.labels[0]}?`;
            solution = selectedTab.values[selectedTab.values.length-1] > selectedTab.values[0] ? "Yes" : "No";
        } else {
            const sum = selectedTab.values.reduce((a, b) => a + b, 0);
            questionText = `Is the total volume across all categories in "${selectedTab.title}" equal to ${sum}?`;
            solution = "Yes";
        }
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
