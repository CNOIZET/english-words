// ==================== DATA LAYER ====================

const DB_KEY = 'englishwords_db';
const HISTORY_KEY = 'englishwords_history';

function loadWords() {
    return JSON.parse(localStorage.getItem(DB_KEY) || '[]');
}

function saveWords(words) {
    localStorage.setItem(DB_KEY, JSON.stringify(words));
}

function loadHistory() {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
}

function saveHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function recordReview() {
    const history = loadHistory();
    const today = new Date().toISOString().split('T')[0];
    history[today] = (history[today] || 0) + 1;
    saveHistory(history);
}

function createWord(en, fr, example = '', category = '') {
    return {
        id: Date.now() + Math.random(),
        en: en.trim(),
        fr: fr.trim(),
        example: example.trim(),
        category: category.trim(),
        level: 0,        // 0=new, 1=learning, 2=learned, 3=mastered
        interval: 0,     // days until next review
        easeFactor: 2.5,
        nextReview: Date.now(),
        reviewCount: 0,
        correctCount: 0,
        createdAt: Date.now()
    };
}


// ==================== TRANSLATION API ====================

let translateTimeout = null;

async function translateWord(englishWord) {
    if (!englishWord.trim()) return null;
    try {
        const response = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(englishWord)}&langpair=en|fr`
        );
        const data = await response.json();
        if (data.responseStatus === 200 && data.responseData.translatedText) {
            let text = data.responseData.translatedText;
            // MyMemory sometimes returns uppercase, normalize
            text = text.toLowerCase();
            return text;
        }
        return null;
    } catch (e) {
        console.warn('Translation error:', e);
        return null;
    }
}

// Spaced repetition (simplified SM-2)
function updateSRS(word, rating) {
    // rating: 1=again, 2=hard, 3=good, 4=easy
    word.reviewCount++;
    if (rating >= 3) word.correctCount++;
    recordReview();

    if (rating === 1) {
        word.interval = 0;
        word.level = 1;
    } else if (rating === 2) {
        word.interval = Math.max(1, word.interval * 1.2);
        word.easeFactor = Math.max(1.3, word.easeFactor - 0.15);
        word.level = Math.min(word.level, 2);
    } else if (rating === 3) {
        if (word.interval === 0) {
            word.interval = 1;
        } else if (word.interval === 1) {
            word.interval = 3;
        } else {
            word.interval = word.interval * word.easeFactor;
        }
        word.easeFactor = Math.max(1.3, word.easeFactor + 0.05);
        word.level = word.reviewCount >= 3 ? 2 : 1;
    } else if (rating === 4) {
        if (word.interval === 0) {
            word.interval = 3;
        } else {
            word.interval = word.interval * word.easeFactor * 1.3;
        }
        word.easeFactor += 0.15;
        word.level = word.reviewCount >= 2 ? 3 : 2;
    }

    word.nextReview = Date.now() + word.interval * 24 * 60 * 60 * 1000;
    return word;
}

function isDue(word) {
    return word.nextReview <= Date.now();
}

function getLevelLabel(level) {
    return ['Nouveau', 'En cours', 'Appris', 'Maitrise'][level] || 'Nouveau';
}

function getLevelClass(level) {
    return ['level-new', 'level-learning', 'level-learned', 'level-mastered'][level] || 'level-new';
}

// ==================== NAVIGATION ====================

const navButtons = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');

navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.view;
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        views.forEach(v => v.classList.remove('active'));
        document.getElementById(target + '-view').classList.add('active');

        if (target === 'flashcard') initFlashcards();
        if (target === 'words') renderWordsList();
        if (target === 'stats') renderStats();
        if (target === 'quiz') resetQuiz();
    });
});

// ==================== FLASHCARDS ====================

let flashcardDeck = [];
let flashcardIndex = 0;

function initFlashcards() {

    const words = loadWords();
    const filter = document.getElementById('flashcard-filter').value;
    const category = document.getElementById('flashcard-category').value;

    if (filter === 'all') flashcardDeck = [...words];
    else if (filter === 'due') flashcardDeck = words.filter(isDue);
    else if (filter === 'new') flashcardDeck = words.filter(w => w.level === 0);
    else if (filter === 'hard') flashcardDeck = words.filter(w => w.level <= 1 && w.reviewCount > 0);

    // Apply category filter
    if (category !== 'all') {
        flashcardDeck = flashcardDeck.filter(w => w.category === category);
    }

    // Shuffle
    flashcardDeck.sort(() => Math.random() - 0.5);
    flashcardIndex = 0;

    if (flashcardDeck.length === 0) {
        document.getElementById('flashcard-empty').style.display = 'block';
        document.getElementById('flashcard-container').style.display = 'none';
    } else {
        document.getElementById('flashcard-empty').style.display = 'none';
        document.getElementById('flashcard-container').style.display = 'block';
        showFlashcard();
    }
}

function showFlashcard() {
    if (flashcardIndex >= flashcardDeck.length) {
        flashcardIndex = 0;
        flashcardDeck.sort(() => Math.random() - 0.5);
    }

    const word = flashcardDeck[flashcardIndex];
    const direction = document.getElementById('flashcard-direction').value;
    const card = document.getElementById('flashcard');

    card.classList.remove('flipped');
    document.getElementById('rating-buttons').style.display = 'none';

    if (direction === 'en-fr') {
        document.getElementById('card-front-text').textContent = word.en;
        document.getElementById('card-back-text').textContent = word.fr;
    } else {
        document.getElementById('card-front-text').textContent = word.fr;
        document.getElementById('card-back-text').textContent = word.en;
    }

    document.getElementById('card-example').textContent = word.example || '';

    const progress = ((flashcardIndex + 1) / flashcardDeck.length) * 100;
    document.getElementById('flashcard-progress').style.width = progress + '%';
    document.getElementById('flashcard-counter').textContent =
        `${flashcardIndex + 1} / ${flashcardDeck.length}`;
}

// ==================== SWIPE LOGIC ====================

const SWIPE_THRESHOLD = 80; // px to trigger swipe
let swipeStartX = 0;
let swipeStartY = 0;
let swipeDeltaX = 0;
let isSwiping = false;
let swipeLocked = false; // prevent swipe during exit animation

function rateAndNext(rating) {
    const word = flashcardDeck[flashcardIndex];
    const words = loadWords();
    const idx = words.findIndex(w => w.id === word.id);
    if (idx >= 0) {
        updateSRS(words[idx], rating);
        saveWords(words);
    }
    flashcardIndex++;
    if (flashcardIndex >= flashcardDeck.length) {
        initFlashcards();
    } else {
        showFlashcard();
    }
}

function initSwipe() {
    const card = document.getElementById('flashcard');
    const leftIndicator = document.querySelector('.swipe-indicator-left');
    const rightIndicator = document.querySelector('.swipe-indicator-right');

    function onPointerDown(e) {
        if (swipeLocked) return;
        const touch = e.touches ? e.touches[0] : e;
        swipeStartX = touch.clientX;
        swipeStartY = touch.clientY;
        swipeDeltaX = 0;
        isSwiping = false;
        card.classList.add('swiping');
    }

    function onPointerMove(e) {
        if (swipeLocked || swipeStartX === 0) return;
        const touch = e.touches ? e.touches[0] : e;
        const dx = touch.clientX - swipeStartX;
        const dy = touch.clientY - swipeStartY;

        // If vertical scroll is dominant, don't swipe
        if (!isSwiping && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
            swipeStartX = 0;
            card.classList.remove('swiping');
            card.style.transform = '';
            return;
        }

        if (Math.abs(dx) > 10) {
            isSwiping = true;
            if (e.cancelable) e.preventDefault();
        }

        if (!isSwiping) return;

        swipeDeltaX = dx;
        const rotate = dx * 0.08;
        card.style.transform = `translateX(${dx}px) rotate(${rotate}deg)`;

        // Show indicators
        const ratio = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
        if (dx < 0) {
            leftIndicator.style.opacity = ratio;
            rightIndicator.style.opacity = 0;
        } else {
            rightIndicator.style.opacity = ratio;
            leftIndicator.style.opacity = 0;
        }
    }

    function onPointerUp(e) {
        if (swipeLocked) return;
        card.classList.remove('swiping');

        if (!isSwiping || Math.abs(swipeDeltaX) < SWIPE_THRESHOLD) {
            // Not a swipe → reset position, treat as click/tap
            card.style.transform = '';
            leftIndicator.style.opacity = 0;
            rightIndicator.style.opacity = 0;

            if (!isSwiping && swipeStartX !== 0) {
                // It was a tap → flip card
                card.classList.toggle('flipped');
                if (card.classList.contains('flipped')) {
                    document.getElementById('rating-buttons').style.display = 'block';
                }
            }
        } else {
            // Swipe confirmed!
            swipeLocked = true;
            const direction = swipeDeltaX > 0 ? 'right' : 'left';

            card.classList.add(direction === 'right' ? 'swipe-exit-right' : 'swipe-exit-left');

            setTimeout(() => {
                leftIndicator.style.opacity = 0;
                rightIndicator.style.opacity = 0;
                card.classList.remove('swipe-exit-left', 'swipe-exit-right');
                card.style.transform = '';
                swipeLocked = false;

                // Right = OK (rating 3), Left = KO (rating 1)
                rateAndNext(direction === 'right' ? 3 : 1);
            }, 350);
        }

        swipeStartX = 0;
        isSwiping = false;
    }

    // Touch events
    card.addEventListener('touchstart', onPointerDown, { passive: true });
    card.addEventListener('touchmove', onPointerMove, { passive: false });
    card.addEventListener('touchend', onPointerUp);

    // Mouse events (for desktop)
    card.addEventListener('mousedown', onPointerDown);
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', (e) => {
        if (swipeStartX !== 0) onPointerUp(e);
    });
}

initSwipe();

// Rating buttons still work as before
document.querySelectorAll('.rate-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        rateAndNext(parseInt(btn.dataset.rating));
    });
});

document.getElementById('flashcard-filter').addEventListener('change', initFlashcards);
document.getElementById('flashcard-direction').addEventListener('change', showFlashcard);
document.getElementById('flashcard-category').addEventListener('change', initFlashcards);

// ==================== QUIZ ====================

let quizQuestions = [];
let quizIndex = 0;
let quizResults = [];

function resetQuiz() {
    document.getElementById('quiz-setup').style.display = 'block';
    document.getElementById('quiz-active').style.display = 'none';
    document.getElementById('quiz-results').style.display = 'none';
}

document.getElementById('start-quiz').addEventListener('click', () => {
    const words = loadWords();
    if (words.length < 4) {
        alert('Il faut au moins 4 mots pour lancer un quiz !');
        return;
    }

    let count = parseInt(document.getElementById('quiz-count').value);
    if (count === 0) count = words.length;
    count = Math.min(count, words.length);

    const directionSetting = document.getElementById('quiz-direction').value;
    const shuffled = [...words].sort(() => Math.random() - 0.5).slice(0, count);

    quizQuestions = shuffled.map(word => {
        let direction = directionSetting;
        if (direction === 'mix') direction = Math.random() > 0.5 ? 'en-fr' : 'fr-en';

        const question = direction === 'en-fr' ? word.en : word.fr;
        const answer = direction === 'en-fr' ? word.fr : word.en;

        // Pick 3 wrong options
        const others = words.filter(w => w.id !== word.id).sort(() => Math.random() - 0.5).slice(0, 3);
        const wrongAnswers = others.map(w => direction === 'en-fr' ? w.fr : w.en);
        const options = [answer, ...wrongAnswers].sort(() => Math.random() - 0.5);

        return { word, question, answer, options, direction };
    });

    quizIndex = 0;
    quizResults = [];

    document.getElementById('quiz-setup').style.display = 'none';
    document.getElementById('quiz-active').style.display = 'block';
    document.getElementById('quiz-results').style.display = 'none';

    showQuizQuestion();
});

function showQuizQuestion() {
    const q = quizQuestions[quizIndex];
    const type = document.getElementById('quiz-type').value;

    document.getElementById('quiz-question').textContent = q.question;
    document.getElementById('quiz-feedback').style.display = 'none';
    document.getElementById('quiz-next').style.display = 'none';

    const progress = ((quizIndex + 1) / quizQuestions.length) * 100;
    document.getElementById('quiz-progress').style.width = progress + '%';
    document.getElementById('quiz-counter').textContent =
        `Question ${quizIndex + 1} / ${quizQuestions.length}`;

    if (type === 'mcq') {
        document.getElementById('quiz-options').style.display = 'grid';
        document.getElementById('quiz-write').style.display = 'none';

        const container = document.getElementById('quiz-options');
        container.innerHTML = '';
        q.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option';
            btn.textContent = opt;
            btn.addEventListener('click', () => handleQuizAnswer(opt, q));
            container.appendChild(btn);
        });
    } else {
        document.getElementById('quiz-options').style.display = 'none';
        document.getElementById('quiz-write').style.display = 'flex';
        const input = document.getElementById('quiz-input');
        input.value = '';
        input.focus();
    }
}

function handleQuizAnswer(userAnswer, q) {
    const normalize = s => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const correct = normalize(userAnswer) === normalize(q.answer);

    quizResults.push({ ...q, userAnswer, correct });

    // Update SRS
    const words = loadWords();
    const idx = words.findIndex(w => w.id === q.word.id);
    if (idx >= 0) {
        updateSRS(words[idx], correct ? 3 : 1);
        saveWords(words);
    }

    // Show feedback
    const feedback = document.getElementById('quiz-feedback');
    feedback.style.display = 'block';
    if (correct) {
        feedback.className = 'quiz-feedback correct';
        feedback.textContent = 'Correct !';
    } else {
        feedback.className = 'quiz-feedback wrong';
        feedback.textContent = `Incorrect. La reponse etait : ${q.answer}`;
    }

    // Highlight options for MCQ
    const options = document.querySelectorAll('.quiz-option');
    options.forEach(opt => {
        opt.classList.add('disabled');
        if (normalize(opt.textContent) === normalize(q.answer)) {
            opt.classList.add('correct');
        } else if (opt.textContent === userAnswer && !correct) {
            opt.classList.add('wrong');
        }
    });

    document.getElementById('quiz-next').style.display = 'block';
}

document.getElementById('quiz-submit').addEventListener('click', () => {
    const input = document.getElementById('quiz-input');
    if (input.value.trim()) {
        handleQuizAnswer(input.value, quizQuestions[quizIndex]);
        document.getElementById('quiz-write').style.display = 'none';
    }
});

document.getElementById('quiz-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        document.getElementById('quiz-submit').click();
    }
});

document.getElementById('quiz-next').addEventListener('click', () => {
    quizIndex++;
    if (quizIndex >= quizQuestions.length) {
        showQuizResults();
    } else {
        showQuizQuestion();
    }
});

function showQuizResults() {
    document.getElementById('quiz-active').style.display = 'none';
    document.getElementById('quiz-results').style.display = 'block';

    const correctCount = quizResults.filter(r => r.correct).length;
    const total = quizResults.length;
    const pct = Math.round((correctCount / total) * 100);

    document.getElementById('quiz-score').textContent = `${pct}% (${correctCount}/${total})`;

    const review = document.getElementById('quiz-review');
    review.innerHTML = quizResults.map(r => `
        <div class="quiz-review-item ${r.correct ? '' : 'wrong-answer'}">
            <span>${r.question} → ${r.answer}</span>
            <span>${r.correct ? '✓' : '✗ ' + r.userAnswer}</span>
        </div>
    `).join('');
}

document.getElementById('quiz-restart').addEventListener('click', resetQuiz);

// ==================== WORDS MANAGEMENT ====================

let editingWordId = null;

function renderWordsList() {

    const words = loadWords();
    const search = document.getElementById('search-words').value.toLowerCase();
    const categoryFilter = document.getElementById('filter-category').value;
    let filtered = words.filter(w =>
        w.en.toLowerCase().includes(search) || w.fr.toLowerCase().includes(search)
    );
    if (categoryFilter !== 'all') {
        filtered = filtered.filter(w => w.category === categoryFilter);
    }

    document.getElementById('word-count').textContent = words.length;

    const list = document.getElementById('words-list');
    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Aucun mot trouve. Ajoutez-en !</p></div>';
        return;
    }

    list.innerHTML = filtered.map(w => `
        <div class="word-item" data-id="${w.id}">
            <div class="word-info">
                <span class="word-en">${escapeHtml(w.en)}</span>
                <span class="word-level ${getLevelClass(w.level)}">${getLevelLabel(w.level)}</span>
                ${w.category ? `<span class="word-category">${escapeHtml(w.category)}</span>` : ''}
                <br><span class="word-fr">${escapeHtml(w.fr)}</span>
            </div>
            <div class="word-actions">
                <button class="btn-secondary edit-word" data-id="${w.id}">Modifier</button>
                <button class="btn-danger delete-word" data-id="${w.id}">Suppr</button>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('.edit-word').forEach(btn => {
        btn.addEventListener('click', () => openEditWord(parseFloat(btn.dataset.id)));
    });

    list.querySelectorAll('.delete-word').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('Supprimer ce mot ?')) {
                const words = loadWords();
                const id = parseFloat(btn.dataset.id);
                saveWords(words.filter(w => w.id !== id));
                renderWordsList();
            }
        });
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

document.getElementById('search-words').addEventListener('input', renderWordsList);
document.getElementById('filter-category').addEventListener('change', renderWordsList);

// Add word
document.getElementById('add-word-btn').addEventListener('click', () => {
    editingWordId = null;
    document.getElementById('modal-title').textContent = 'Ajouter un mot';
    document.getElementById('input-english').value = '';
    document.getElementById('input-french').value = '';
    document.getElementById('input-category').value = '';
    document.getElementById('input-example').value = '';
    document.getElementById('translate-status').textContent = '';
    document.getElementById('translate-status').className = 'translate-status';

    document.getElementById('word-modal').style.display = 'flex';
    document.getElementById('input-english').focus();
});

function openEditWord(id) {
    const words = loadWords();
    const word = words.find(w => w.id === id);
    if (!word) return;

    editingWordId = id;
    document.getElementById('modal-title').textContent = 'Modifier le mot';
    document.getElementById('input-english').value = word.en;
    document.getElementById('input-french').value = word.fr;
    document.getElementById('input-category').value = word.category || '';
    document.getElementById('input-example').value = word.example || '';
    document.getElementById('translate-status').textContent = '';
    document.getElementById('translate-status').className = 'translate-status';

    document.getElementById('word-modal').style.display = 'flex';
    document.getElementById('input-english').focus();
}

document.getElementById('save-word').addEventListener('click', () => {
    const en = document.getElementById('input-english').value.trim();
    const fr = document.getElementById('input-french').value.trim();
    const category = document.getElementById('input-category').value.trim();
    const example = document.getElementById('input-example').value.trim();

    if (!en || !fr) {
        alert('Remplissez les champs anglais et francais.');
        return;
    }

    const words = loadWords();

    if (editingWordId) {
        const idx = words.findIndex(w => w.id === editingWordId);
        if (idx >= 0) {
            words[idx].en = en;
            words[idx].fr = fr;
            words[idx].category = category;
            words[idx].example = example;
        }
    } else {
        words.push(createWord(en, fr, example, category));
    }

    saveWords(words);
    document.getElementById('word-modal').style.display = 'none';
    renderWordsList();
});

// ==================== TRANSLATE BUTTON ====================

document.getElementById('btn-translate').addEventListener('click', async () => {
    const en = document.getElementById('input-english').value.trim();
    if (!en) return;

    const btn = document.getElementById('btn-translate');
    const status = document.getElementById('translate-status');
    btn.disabled = true;
    btn.textContent = '...';
    status.className = 'translate-status loading';
    status.textContent = '';

    const translation = await translateWord(en);

    btn.disabled = false;
    btn.textContent = 'Traduire';
    status.className = 'translate-status';

    if (translation) {
        document.getElementById('input-french').value = translation;
        status.textContent = 'Suggestion auto';
    } else {
        status.textContent = 'Traduction indisponible';
    }
});

document.getElementById('cancel-word').addEventListener('click', () => {
    document.getElementById('word-modal').style.display = 'none';
});

// Import
document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-modal').style.display = 'flex';
    document.getElementById('import-text').value = '';
    document.getElementById('import-text').focus();
});

document.getElementById('do-import').addEventListener('click', () => {
    const text = document.getElementById('import-text').value;
    const lines = text.split('\n').filter(l => l.trim());
    const words = loadWords();
    let count = 0;

    lines.forEach(line => {
        const parts = line.split(/[,;]/).map(s => s.trim());
        if (parts.length >= 2) {
            const en = parts[0];
            const fr = parts[1];
            const category = parts[2] || '';
            const example = parts[3] || '';
            // Avoid duplicates
            if (!words.some(w => w.en.toLowerCase() === en.toLowerCase())) {
                words.push(createWord(en, fr, example, category));
                count++;
            }
        }
    });

    saveWords(words);
    document.getElementById('import-modal').style.display = 'none';
    renderWordsList();
    alert(`${count} mot(s) importe(s) !`);
});

document.getElementById('cancel-import').addEventListener('click', () => {
    document.getElementById('import-modal').style.display = 'none';
});

// Export
document.getElementById('export-btn').addEventListener('click', () => {
    const words = loadWords();
    const csv = words.map(w => `${w.en};${w.fr};${w.category || ''};${w.example || ''}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'english_words.csv';
    a.click();
    URL.revokeObjectURL(url);
});

// ==================== STATS ====================

function renderStats() {
    const words = loadWords();
    const history = loadHistory();

    document.getElementById('stat-total').textContent = words.length;
    document.getElementById('stat-learned').textContent = words.filter(w => w.level >= 2).length;
    document.getElementById('stat-due').textContent = words.filter(isDue).length;

    // Streak
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        if (history[key]) streak++;
        else break;
    }
    document.getElementById('stat-streak').textContent = streak;

    // Distribution
    const levels = [0, 1, 2, 3];
    const counts = levels.map(l => words.filter(w => w.level === l).length);
    const maxCount = Math.max(...counts, 1);
    const labels = ['Nouveau', 'En cours', 'Appris', 'Maitrise'];
    const colors = ['#DFE6E9', '#FFEAA7', '#55EFC4', '#A29BFE'];

    document.getElementById('stats-distribution').innerHTML = levels.map((l, i) => `
        <div class="dist-bar">
            <div class="dist-bar-fill">
                <div class="dist-bar-inner" style="height:${(counts[i]/maxCount)*100}%;background:${colors[i]}"></div>
            </div>
            <div class="dist-bar-count">${counts[i]}</div>
            <div class="dist-bar-label">${labels[i]}</div>
        </div>
    `).join('');

    // History (last 7 days)
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        days.push({ date: key, count: history[key] || 0 });
    }
    const maxDay = Math.max(...days.map(d => d.count), 1);

    document.getElementById('stats-history').innerHTML = days.map(d => {
        const label = new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
        return `
            <div class="history-day">
                <span class="history-date">${label}</span>
                <div class="history-bar">
                    <div class="history-bar-fill" style="width:${(d.count/maxDay)*100}%"></div>
                </div>
                <span class="history-count">${d.count}</span>
            </div>
        `;
    }).join('');
}

// ==================== INIT ====================

// Load some sample words if empty
function initSampleData() {
    const words = loadWords();
    if (words.length === 0) {
        const samples = [
            ['however', 'cependant', 'However, this is not always the case.', 'Nouveaux'],
            ['therefore', 'par consequent', 'Therefore, we need to act now.', 'Nouveaux'],
            ['although', 'bien que', 'Although it was raining, we went out.', 'Nouveaux'],
            ['meanwhile', 'pendant ce temps', 'Meanwhile, the others were waiting.', 'Nouveaux'],
            ['straightforward', 'simple, direct', 'The instructions are straightforward.', 'Nouveaux'],
            ['to achieve', 'accomplir, atteindre', 'She achieved her goals.', 'Nouveaux'],
            ['to struggle', 'lutter, avoir du mal', 'He struggled with the exercise.', 'Difficiles'],
            ['reliable', 'fiable', 'She is a very reliable person.', 'Nouveaux'],
            ['outcome', 'resultat', 'The outcome was unexpected.', 'Nouveaux'],
            ['to emphasize', 'souligner, insister sur', 'I want to emphasize this point.', 'A reviser'],
            ['thorough', 'minutieux, approfondi', 'She did a thorough analysis.', 'Difficiles'],
            ['to acknowledge', 'reconnaitre', 'He acknowledged his mistake.', 'A reviser'],
            ['challenging', 'stimulant, difficile', 'This is a challenging task.', 'Nouveaux'],
            ['to enhance', 'ameliorer', 'We need to enhance the quality.', 'Nouveaux'],
            ['comprehensive', 'complet, exhaustif', 'A comprehensive guide to English.', 'Difficiles'],
        ];
        samples.forEach(([en, fr, ex, cat]) => words.push(createWord(en, fr, ex, cat)));
        saveWords(words);
    }
}

initSampleData();

// Import Quizlet list 1 (one-time import)
function importQuizletData1() {
    const KEY = 'englishwords_quizlet1_imported';
    if (localStorage.getItem(KEY)) return;

    const quizletWords1 = [
        ['furniture store', 'magasin de meubles'],
        ['furniture', 'meubles'],
        ['blanket', 'couverture'],
        ['thirsty', 'assoifé'],
        ['straight', 'tout droit'],
        ['straight away', 'tout de suite'],
        ['deep', 'profond'],
        ['shallow', 'peu profond'],
        ['lurking', 'cachette'],
        ['mean, nasty', 'méchant'],
        ['crafty', 'rusé, -e'],
        ['dwarf', 'nain'],
        ['to mash', 'écraser'],
        ['robber', 'voleur'],
        ['shovel', 'pelle'],
        ['bad smell', 'mauvaise odeur'],
        ['weird', 'bizarre, étrange'],
        ['roommate', 'colocataire'],
        ['peppers', 'poivrons'],
        ['an apology', 'une excuse'],
        ['pepper', 'poivre'],
        ['mean', 'vouloir dire, signifier'],
        ['scarf', 'echarpe'],
        ['leading role', 'rôle principal'],
        ['greasy', 'graisseux'],
        ['orchards', 'vergers'],
        ['crook', 'escroc'],
        ['filthy', 'crasseux'],
        ['ugly', 'laid'],
        ['wardrobe', 'garde-robe'],
        ['Easter', 'Paques'],
        ['underwear', 'sous-vêtements'],
        ['to allow', 'permettre'],
        ['upset', 'contrarié(e)'],
        ['to rest', 'se reposer'],
        ['rug', 'tapis'],
        ['curtains', 'rideaux'],
        ['pillow', 'oreiller'],
        ['skinny', 'mince'],
        ['tall', 'grand'],
        ['small, short', 'petit'],
        ['cloudy', 'nuageux'],
        ['rainy', 'pluvieux'],
        ['sunny', 'ensoleillé'],
        ['thick', 'epais'],
        ['buddy', 'copain'],
        ['nephew', 'neveu'],
        ['ceiling', 'plafond'],
        ['tissue', 'mouchoir en papier'],
        ['forehead', 'front'],
        ['to have a runny nose', 'le nez qui coule'],
        ['sweat', 'sueur'],
        ['to feel weak', 'se sentir faible'],
        ['sore throat', 'un mal de gorge'],
        ['to breathe', 'respirer'],
        ['an illness', 'une maladie'],
        ['to go to bed, to lie down', 'se coucher'],
        ['apron', 'tablier'],
        ['dizzy', 'etourdi'],
        ['bits', 'morceaux'],
        ['really, truly', 'vraiment'],
        ['wheat', 'blé'],
        ['common cold', 'rhume'],
        ['bland', 'fade, insipide'],
        ['swimsuit', 'maillot de bain'],
        ['to do the housework', 'faire le ménage'],
        ['to hike', 'une randonnée'],
        ['paddles', 'palmes'],
        ['helmet', 'casque'],
        ['rope', 'corde'],
        ['sand', 'sable'],
        ['wire', 'câble'],
        ['light bulb', 'ampoule'],
        ['lampshade', 'abat-jour'],
        ['cloth', 'tissu'],
        ['to gather', 'rassembler'],
        ['handle', 'poignée'],
        ['landlord', 'propriétaire'],
        ['to fill out a form', 'remplir un formulaire'],
        ['to hang up', 'raccrocher'],
        ['to move out', 'déménager'],
        ["I can't stand", 'Je ne peux pas supporter'],
        ['eggplant', 'aubergine'],
        ['to take an exam', 'passer un examen'],
        ['couch', 'canapé'],
        ['to borrow', 'emprunter'],
        ['to lend', 'préter'],
        ['chopsticks', 'Baguettes chinoises'],
        ['to hope for', 'esperer'],
        ['goalie', 'gardien de but'],
        ['crowd', 'la foule'],
        ['to defy, to challenge', 'défier'],
        ['to injure oneself', 'se blesser'],
        ['an opponent', 'un opposant'],
        ['soccer field', 'terrain de foot'],
        ['tough', 'dur, dure'],
    ];

    const words = loadWords();
    let count = 0;
    quizletWords1.forEach(([en, fr]) => {
        if (!words.some(w => w.en.toLowerCase() === en.toLowerCase())) {
            words.push(createWord(en, fr, '', 'Nouveaux'));
            count++;
        }
    });

    if (count > 0) {
        saveWords(words);
        console.log(`Imported ${count} words from Quizlet list 1`);
    }
    localStorage.setItem(KEY, 'true');
}

importQuizletData1();

// Import Quizlet list 2 (one-time import)
function importQuizletData() {
    const QUIZLET_IMPORTED_KEY = 'englishwords_quizlet_imported';
    if (localStorage.getItem(QUIZLET_IMPORTED_KEY)) return;

    const quizletWords = [
        ['staff', 'personnel'],
        ['wealth', 'Patrimoine'],
        ['to exercise', 'faire du sport'],
        ['doctor', 'médecin'],
        ['tooth', 'une dent'],
        ['to hurt', 'se faire mal'],
        ['surprising', 'surprenant'],
        ['to break up', 'rupture (f)'],
        ['to set the table', 'mettre la table'],
        ['to practice', 'repeter'],
        ['guests', 'invités'],
        ['to grow up', 'grandir'],
        ["It's foggy", 'Il y a du brouillard'],
        ['terrible', 'horrible, affreux'],
        ['Lie down', "S'allonger"],
        ['Sounds good', 'Ça marche'],
        ['Do you mind', 'Ça te dérange'],
        ['while', 'pendant que'],
        ["can't wait", 'avoir hate de'],
        ["I'd love to", 'avec plaisir'],
        ["I don't mind", 'Ça ne me dérange pas'],
        ['let me know', 'Tiens-moi au courant'],
        ['Take care of', "S'occuper de"],
        ['Until', "Jusqu'à"],
        ['game', 'match (m)'],
        ['delayed', 'retardé'],
        ['heat', 'le chauffage'],
        ['purse', 'sac à main'],
        ['yuk', 'Beurk'],
        ['rest', 'se reposer'],
        ['chores', 'les tâches ménagères'],
        ['water the plants', 'arroser les plantes'],
        ['To get groceries', 'faire les courses'],
        ['cookbook', 'livre de cuisine'],
        ['cutboard', 'la planche à découper'],
        ['sharp', 'tranchant'],
        ['sentence', 'phrase (f)'],
        ['pan', 'poele'],
        ['pot', 'casserole'],
        ['folder', 'dossier (m)'],
        ['manager', 'responsable (m/f)'],
        ['to get along with', "bien s'entendre avec"],
        ['toothbrush', 'brosse à dents'],
        ['in shape', 'en forme'],
        ['fall off', 'tomber de'],
        ['blanket', 'couverture'],
        ['pillow', 'oreiller'],
        ['sheets', 'draps (m)'],
        ['flu', 'la grippe'],
        ['appointment', 'rendez-vous'],
        ['sneeze', 'éternuer'],
        ['cough', 'tousser'],
        ['tissues', 'mouchoirs'],
        ['blow your nose', 'se moucher'],
        ['fever', 'de la fièvre'],
        ['midterm', 'examen partiel'],
        ['finals', 'examens finaux'],
        ['take a test', 'passer un examen'],
        ['pass', 'réussir'],
        ['fail', 'échouer, rater'],
        ['grade', 'note, classe'],
        ['undergraduate', 'étudiant du premier cycle'],
        ['graduate', 'diplômé'],
        ['loan', 'prêt, emprunt (m)'],
        ['degree', 'diplôme'],
        ['scholarship', 'bourse (f)'],
        ['withdraw', 'retirer'],
        ['ATM', 'distributeur automatique'],
        ['savings account', "compte d'épargne"],
        ['checking account', 'compte courant'],
        ['traffic jam', 'embouteillage (m)'],
        ['cab', 'taxi'],
        ['truck', 'camion'],
        ['highway', 'autoroute (f)'],
        ['speed limit', 'limitation de vitesse'],
        ['flat tire', 'pneu crevé'],
        ['engine', 'moteur'],
        ['seat belt', 'ceinture de sécurité'],
        ['steering wheel', 'volant (m)'],
        ['windshield', 'pare-brise'],
        ['brakes', 'freins (m)'],
    ];

    const words = loadWords();
    let count = 0;
    quizletWords.forEach(([en, fr]) => {
        if (!words.some(w => w.en.toLowerCase() === en.toLowerCase())) {
            words.push(createWord(en, fr, '', 'Nouveaux'));
            count++;
        }
    });

    if (count > 0) {
        saveWords(words);
        console.log(`Imported ${count} words from Quizlet`);
    }
    localStorage.setItem(QUIZLET_IMPORTED_KEY, 'true');
}

importQuizletData();
initFlashcards();
