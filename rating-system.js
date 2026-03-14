import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";

const RATING_HTML = `
<div class="rating-wrapper" style="display: flex; justify-content: center; align-items: center; width: 100%; min-height: 100%; padding: 1rem 0;">
    <div class="rating-container" style="margin-top: 1rem; padding: 2.5rem; text-align: center; background: #ffffff; border-radius: 24px; animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1); max-height: 75vh; overflow-y: auto; width: 95%; max-width: 500px; box-sizing: border-box; border: 1px solid rgba(226, 232, 240, 0.8); box-shadow: 0 0 0 1px rgba(201, 0, 118, 0.05), 0 20px 50px rgba(0, 0, 0, 0.1), 0 0 0 4px rgba(201, 0, 118, 0.03); position: relative;">
        <h3 style="margin-bottom: 0.5rem; color: #0f172a; font-weight: 800; font-size: 1.5rem; letter-spacing: -0.025em;">Enjoyed this challenge?</h3>
        <p style="color: #64748b; font-size: 1rem; margin-bottom: 1.5rem; opacity: 0.9;">Your feedback helps us make AptiVerse better!</p>
        
        <div class="star-rating" style="display: flex; justify-content: center; gap: 0.85rem; margin-bottom: 1.5rem;">
            <i class="far fa-star rating-star" data-rating="1" style="font-size: 2.5rem; color: #cbd5e1; cursor: pointer; transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.2s;"></i>
            <i class="far fa-star rating-star" data-rating="2" style="font-size: 2.5rem; color: #cbd5e1; cursor: pointer; transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.2s;"></i>
            <i class="far fa-star rating-star" data-rating="3" style="font-size: 2.5rem; color: #cbd5e1; cursor: pointer; transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.2s;"></i>
            <i class="far fa-star rating-star" data-rating="4" style="font-size: 2.5rem; color: #cbd5e1; cursor: pointer; transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.2s;"></i>
            <i class="far fa-star rating-star" data-rating="5" style="font-size: 2.5rem; color: #cbd5e1; cursor: pointer; transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.2s;"></i>
        </div>
        
        <div id="rating-comment-box" class="hidden" style="margin-bottom: 1rem; animation: fadeIn 0.4s ease-out;">
            <textarea id="rating-comment" placeholder="Any suggestions to make it better? (Optional)" 
                style="width: 100%; padding: 1rem; border: 2px solid #f1f5f9; border-radius: 18px; font-family: inherit; resize: none; min-height: 100px; font-size: 1rem; transition: all 0.2s; outline: none; background: #f8fafc;"></textarea>
            <button id="submit-rating-btn" class="btn btn-primary" style="width: 100%; margin-top: 1.25rem; padding: 1rem; font-size: 1.1rem; border-radius: 16px; font-weight: 700; transform: translateZ(0); transition: all 0.2s;">Submit Review</button>
        </div>
        
        <p id="rating-status" style="font-size: 0.95rem; color: #10b981; font-weight: 700; min-height: 1.5rem; margin-top: 0.75rem;"></p>
        
        <style>
            @keyframes slideUp { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            .rating-star:hover { transform: scale(1.25); color: #fbbf24 !important; }
            #rating-comment:focus { border-color: #c90076; background: #fff; box-shadow: 0 0 0 4px rgba(201, 0, 118, 0.1); }
            #submit-rating-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(201, 0, 118, 0.3); }
            #submit-rating-btn:active { transform: translateY(0); }
            
            /* Premium Scrollbar */
            .rating-container::-webkit-scrollbar { width: 6px; }
            .rating-container::-webkit-scrollbar-track { background: transparent; }
            .rating-container::-webkit-scrollbar-thumb { 
                background: #e2e8f0; 
                border-radius: 10px;
            }
            .rating-container::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
            
            @media (max-width: 480px) {
                .rating-container { padding: 1.5rem; max-height: 65vh; width: 90%; }
                .rating-star { font-size: 2rem !important; }
                h3 { font-size: 1.25rem !important; }
            }
        </style>
    </div>
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
                    timestamp: serverTimestamp()
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
