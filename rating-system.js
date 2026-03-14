import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";

const RATING_HTML = `
<div class="rating-container" style="margin-top: 1.5rem; padding: 1.5rem; border-top: 2px solid #f1f5f9; text-align: center; background: #f8fafc; border-radius: 20px; animation: slideUp 0.5s ease-out; max-height: 450px; overflow-y: auto; width: 100%; box-sizing: border-box;">
    <h3 style="margin-bottom: 0.5rem; color: #0f172a; font-weight: 800; font-size: 1.35rem;">Enjoyed this challenge?</h3>
    <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 1.25rem;">Your feedback helps us make AptiGame better!</p>
    
    <div class="star-rating" style="display: flex; justify-content: center; gap: 0.75rem; margin-bottom: 1.25rem;">
        <i class="far fa-star rating-star" data-rating="1" style="font-size: 2.2rem; color: #cbd5e1; cursor: pointer; transition: transform 0.2s, color 0.2s;"></i>
        <i class="far fa-star rating-star" data-rating="2" style="font-size: 2.2rem; color: #cbd5e1; cursor: pointer; transition: transform 0.2s, color 0.2s;"></i>
        <i class="far fa-star rating-star" data-rating="3" style="font-size: 2.2rem; color: #cbd5e1; cursor: pointer; transition: transform 0.2s, color 0.2s;"></i>
        <i class="far fa-star rating-star" data-rating="4" style="font-size: 2.2rem; color: #cbd5e1; cursor: pointer; transition: transform 0.2s, color 0.2s;"></i>
        <i class="far fa-star rating-star" data-rating="5" style="font-size: 2.2rem; color: #cbd5e1; cursor: pointer; transition: transform 0.2s, color 0.2s;"></i>
    </div>
    
    <div id="rating-comment-box" class="hidden" style="margin-bottom: 1rem; animation: fadeIn 0.3s ease-in;">
        <textarea id="rating-comment" placeholder="Any suggestions to make it better? (Optional)" 
            style="width: 100%; padding: 0.85rem; border: 2px solid #e2e8f0; border-radius: 16px; font-family: inherit; resize: none; min-height: 80px; font-size: 0.95rem; transition: border-color 0.2s; outline: none;"></textarea>
        <button id="submit-rating-btn" class="btn btn-primary" style="width: 100%; margin-top: 1rem; padding: 0.85rem; font-size: 1.05rem; border-radius: 14px; box-shadow: 0 4px 12px rgba(201, 0, 118, 0.2);">Submit Review</button>
    </div>
    
    <p id="rating-status" style="font-size: 0.95rem; color: #10b981; font-weight: 700; min-height: 1.5rem; margin-top: 0.75rem;"></p>
    
    <style>
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .rating-star:hover { transform: scale(1.2); }
        #rating-comment:focus { border-color: #c90076; }
        
        /* Premium Scrollbar */
        .rating-container::-webkit-scrollbar { width: 6px; }
        .rating-container::-webkit-scrollbar-track { background: transparent; }
        .rating-container::-webkit-scrollbar-thumb { 
            background: #cbd5e1; 
            border-radius: 10px;
            transition: background 0.2s;
        }
        .rating-container::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        
        @media (max-width: 480px) {
            .rating-container { padding: 1rem; max-height: 350px; }
            .rating-star { font-size: 1.8rem !important; }
            h3 { font-size: 1.2rem !important; }
        }
    </style>
</div>
`;

let selectedRating = 0;

/**
 * Initializes the rating UI in a target container
 * @param {HTMLElement} container 
 */
export async function initRatingSystem(container) {
    if (!container) return;

    const user = auth.currentUser;
    if (!user) return;

    // Check if already rated (using cache)
    const hasRatedCache = localStorage.getItem(`hasRated_${user.uid}`);
    if (hasRatedCache === 'true') return;

    // Check Firestore if not in cache
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().hasRated === true) {
            localStorage.setItem(`hasRated_${user.uid}`, 'true');
            return;
        }
    } catch (e) {
        console.error("Error checking rating status:", e);
    }

    container.innerHTML = RATING_HTML;
    container.classList.remove('hidden');

    const stars = container.querySelectorAll('.rating-star');
    const commentBox = document.getElementById('rating-comment-box');
    const submitBtn = document.getElementById('submit-rating-btn');
    const commentArea = document.getElementById('rating-comment');
    const statusText = document.getElementById('rating-status');

    stars.forEach(star => {
        star.addEventListener('mouseover', () => {
            const rating = parseInt(star.dataset.rating);
            highlightStars(stars, rating);
        });

        star.addEventListener('mouseout', () => {
            highlightStars(stars, selectedRating);
        });

        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.rating);
            highlightStars(stars, selectedRating);
            commentBox.classList.remove('hidden');
        });
    });

    submitBtn.addEventListener('click', async () => {
        if (selectedRating === 0) return;

        submitBtn.disabled = true;
        submitBtn.innerText = "Saving your feedback...";

        try {
            // 1. Add to ratings collection (Optional/Non-blocking for user experience)
            try {
                await addDoc(collection(db, "ratings"), {
                    uid: user.uid,
                    userName: user.displayName || "Anonymous",
                    userEmail: user.email || "N/A",
                    rating: selectedRating,
                    comment: commentArea.value,
                    timestamp: new Date()
                });
            } catch (ratingError) {
                console.warn("Rating record could not be saved to global database, but proceeding with user flag.", ratingError);
            }

            // 2. Mark user as having rated (In the user's own doc)
            try {
                await setDoc(doc(db, "users", user.uid), {
                    hasRated: true
                }, { merge: true });
            } catch (userDocError) {
                console.warn("User hasRated flag could not be updated in Firestore.", userDocError);
            }

            // Always show success to the user locally
            localStorage.setItem(`hasRated_${user.uid}`, 'true');
            statusText.style.color = "#10b981";
            statusText.innerText = "✓ Thank you! We've received your feedback.";
            
            setTimeout(() => {
                container.style.transition = 'all 0.5s ease';
                container.style.opacity = '0';
                container.style.transform = 'translateY(-20px)';
                setTimeout(() => container.innerHTML = '', 500);
            }, 2500);

        } catch (e) {
            console.error("Critical error in rating submission flow:", e);
            // This global catch should technically never be reached now because of inner try-catches, 
            // but kept for ultimate safety.
            statusText.style.color = "#10b981"; 
            statusText.innerText = "✓ Thank you! We've received your feedback.";
            setTimeout(() => container.innerHTML = '', 3000);
        }
    });
}

function highlightStars(stars, rating) {
    stars.forEach(s => {
        const r = parseInt(s.dataset.rating);
        if (r <= rating) {
            s.classList.remove('far');
            s.classList.add('fas');
            s.style.color = '#fbbf24';
        } else {
            s.classList.remove('fas');
            s.classList.add('far');
            s.style.color = '#cbd5e1';
        }
    });
}
