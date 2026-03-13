import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

// --- Game Constants ---
const LEVELS_PER_MODULE = 18;
const MODULE_TIME = 360; 
const POINTS_PER_CORRECT = 3;

// --- State Variables ---
let currentModule = 1;
let currentLevel = 1;
let score = 0;
let correctAnswers = 0;
let timeLeft = MODULE_TIME;
let timerInterval = null;
const isMock = new URLSearchParams(window.location.search).get('mode') === 'mock';
let currentData = null; 
let currentSolution = null; 
let activeDoc = 0;

const sounds = {
    correct: new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3'),
    wrong: new Audio('https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3')
};

// --- DOM Elements ---
const elTimer = document.getElementById('timer-display');
const elScore = document.getElementById('score-display');
const elLevel = document.getElementById('level-display');
const elModule = document.getElementById('module-display');
const elQuestion = document.getElementById('question-text');
const elCardContainer = document.getElementById('cards-grid'); 
const elDocViewer = document.getElementById('paragraph-viewer');
const elReadingView = document.getElementById('reading-view');
const elAnswerBar = document.getElementById('answer-bar');
const elModuleSelection = document.getElementById('module-selection');
const elResultsModal = document.getElementById('results-modal');
const elGameContainer = document.getElementById('game-container');
const elGameHeader = document.getElementById('game-header');
const elModuleGrid = document.getElementById('module-grid');

const elScoreText = document.getElementById('score-text');
const elFinalMarks = document.getElementById('final-marks-val');
const elAccuracyText = document.getElementById('accuracy-text');
const elNextModuleBtn = document.getElementById('next-module-btn');
const elBackToModulesBtn = document.getElementById('back-to-modules-btn');

// --- Initialization ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    }
});

function initModuleGrid() {
    const modules = [
        { id: 1, name: "Module 1", desc: "Explicit Information", color: "linear-gradient(135deg, #3b82f6, #60a5fa)" },
        { id: 2, name: "Module 2", desc: "Inference & Logic", color: "linear-gradient(135deg, #10b981, #34d399)" },
        { id: 3, name: "Module 3", desc: "Technical Synthesis", color: "linear-gradient(135deg, #f59e0b, #fbbf24)" },
        { id: 4, name: "Module 4", desc: "Abstract Concepts", color: "linear-gradient(135deg, #8b5cf6, #a78bfa)" },
        { id: 5, name: "Module 5", desc: "Strategic Reading", color: "linear-gradient(135deg, #ef4444, #f87171)" }
    ];

    elModuleGrid.innerHTML = '';
    modules.forEach(m => {
        const card = document.createElement('div');
        card.className = "card module-card";
        card.innerHTML = `
            <div class="card-img" style="height: 140px; background: ${m.color}; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 4rem; font-weight: 800; color: white; opacity: 0.9;">${m.id}</span>
            </div>
            <div class="card-content">
                <h3>${m.name}</h3>
                <p>${m.desc}</p>
            </div>
        `;
        card.onclick = () => startModule(m.id);
        elModuleGrid.appendChild(card);
    });
}
if (!isMock) initModuleGrid();
else {
    // Auto-start first module in mock mode
    setTimeout(() => startModule(1), 500);
}

// --- Data Generation ---
function generateRCData() {
    const topics = [
        { name: "Global Climate Policy", facts: ["Carbon tax is 5%", "Target year is 2050", "Budget is $2B", "Renewables share 40%"] },
        { name: "Advanced Robotics AI", facts: ["Version 4.2 released", "Sensor range is 10m", "Processing speed 2GHz", "Battery life 12h"] },
        { name: "Urban Planning 2030", facts: ["Green space min 30%", "Bike lanes 500km", "Traffic limit 40kph", "Population cap 2M"] },
        { name: "Maritime Logistics", facts: ["Port capacity 1M TEU", "Dredging depth 15m", "Vessel limit 400m", "Wait time 48h"] },
        { name: "Deep Sea Exploration", facts: ["Pressure 1000 atm", "Oxygen duration 8h", "Max depth 11km", "Species found 450"] },
        { name: "Semiconductor Markets", facts: ["Yield rate 94%", "Nano-size 3nm", "Fabrication cost $5B", "Lead time 16 weeks"] }
    ];

    const docs = topics.map((t, idx) => {
        const p = `The current ${t.name} framework outlines several critical parameters. ${t.facts[0]}. Furthermore, the ${t.facts[1]} remains a key milestone. Additional reports suggest a ${t.facts[2]} is required for Phase 1. Finally, researchers noted that ${t.facts[3]} during the last audit.`;
        return { id: idx, title: t.name, text: p, facts: t.facts };
    });

    const targetDoc = docs[Math.floor(Math.random() * docs.length)];
    const targetFact = targetDoc.facts[Math.floor(Math.random() * targetDoc.facts.length)];
    
    let questionText = "";
    let solution = "";

    const roll = Math.random();
    if (roll < 0.5) {
        questionText = `Does the document "${targetDoc.title}" state that ${targetFact}?`;
        solution = "Yes";
    } else {
        const wrongDoc = docs.find(d => d.id !== targetDoc.id);
        questionText = `Does the document "${wrongDoc.title}" mention ${targetFact}?`;
        solution = "No";
    }

    return { docs, questionText, solution };
}

// --- Rendering ---
function renderDocCards() {
    elCardContainer.innerHTML = '';
    currentData.docs.forEach((doc, index) => {
        const card = document.createElement('div');
        card.className = 'data-card';
        card.innerHTML = `
            <i class="fas fa-file-alt card-icon"></i>
            <div class="card-label">DOCUMENT</div>
            <div class="card-title">${doc.title}</div>
        `;
        card.onclick = () => {
            activeDoc = index;
            toggleReadingView(true);
            renderActiveDoc();
        };
        elCardContainer.appendChild(card);
    });
}

function toggleReadingView(show) {
    if (show) {
        elCardContainer.style.display = 'none';
        elReadingView.style.display = 'flex';
        elAnswerBar.style.display = 'flex';
    } else {
        elCardContainer.style.display = 'grid';
        elReadingView.style.display = 'none';
        elAnswerBar.style.display = 'none';
    }
}
window.toggleReadingView = toggleReadingView;

function renderActiveDoc() {
    const doc = currentData.docs[activeDoc];
    elDocViewer.innerText = doc.text;
}

// --- Game Flow ---
window.startModule = (mod) => {
    currentModule = mod;
    currentLevel = 1;
    score = 0;
    correctAnswers = 0;
    timeLeft = MODULE_TIME;
    
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
    toggleReadingView(false);
    currentData = generateRCData();
    currentSolution = currentData.solution;
    elQuestion.innerHTML = currentData.questionText;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;
    document.getElementById('level-indicator').innerText = `Q${currentLevel}`;
    renderDocCards();
}

window.handleAnswer = (ans) => {
    const buttons = document.querySelectorAll('.ans-btn');
    buttons.forEach(btn => btn.style.pointerEvents = 'none');
    
    const clickedBtn = Array.from(buttons).find(btn => btn.innerText.toLowerCase().includes(ans.toLowerCase().replace("'", "")));

    if (ans === currentSolution) {
        score += POINTS_PER_CORRECT;
        correctAnswers++;
        sounds.correct.play().catch(() => {});
        if (clickedBtn) clickedBtn.classList.add('correct');
        showFeedbackPopup("CORRECT!", "+3 MARKS", "#22c55e");
    } else {
        sounds.wrong.play().catch(() => {});
        if (clickedBtn) clickedBtn.classList.add('incorrect');
        
        setTimeout(() => {
            const correctBtn = Array.from(buttons).find(btn => btn.innerText.toLowerCase().includes(currentSolution.toLowerCase().replace("'", "")));
            if (correctBtn) correctBtn.classList.add('correct');
        }, 300);
        showFeedbackPopup("WRONG!", "NO MARKS", "#ef4444");
    }
    
    currentLevel++;
    setTimeout(() => {
        buttons.forEach(btn => {
            btn.classList.remove('correct', 'incorrect');
            btn.style.pointerEvents = 'auto';
        });
        nextLevel();
    }, 1500);
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
    elResultsModal.classList.remove('hidden');
    elScoreText.innerText = `${correctAnswers} / ${LEVELS_PER_MODULE}`;
    elFinalMarks.innerText = score;
    elAccuracyText.innerText = `${Math.round((correctAnswers / LEVELS_PER_MODULE) * 100)}%`;

    const user = auth.currentUser;
    if (user) {
        try {
            await addDoc(collection(db, "leaderboards", "rc", "scores"), {
                name: user.displayName,
                score: score,
                totalLevels: LEVELS_PER_MODULE,
                metrics: { correctAnswers, timeSpent: MODULE_TIME - timeLeft },
                timestamp: new Date()
            });
        } catch (e) { console.error(e); }
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
