// Tomato Varieties Database - Frontend JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the application
    initializeApp();
});

function initializeApp() {
    // Add fade-in animation to main content
    const mainContent = document.querySelector('main');
    if (mainContent) {
        mainContent.classList.add('fade-in');
    }
    
    // Initialize search functionality
    initializeSearch();
    
    // Initialize tooltips if Bootstrap is available
    if (typeof bootstrap !== 'undefined') {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }
    
    // Add keyboard shortcuts
    initializeKeyboardShortcuts();
    
    // Initialize lazy loading for images
    initializeLazyLoading();

    // Initialize the homepage discovery toy when present
    initializeTomatoToy();
}

function initializeSearch() {
    const searchForms = document.querySelectorAll('form[action="/search"]');
    
    searchForms.forEach(form => {
        const searchInput = form.querySelector('input[name="q"]');
        
        if (searchInput) {
            // Add search suggestions (if we had a suggestions endpoint)
            searchInput.addEventListener('input', debounce(function(e) {
                const query = e.target.value.trim();
                if (query.length >= 2) {
                    // Could implement live search suggestions here
                    console.log('Searching for:', query);
                }
            }, 300));
            
            // Handle form submission
            form.addEventListener('submit', function(e) {
                const query = searchInput.value.trim();
                if (!query) {
                    e.preventDefault();
                    alert('Please enter a search term');
                    searchInput.focus();
                }
            });
        }
    });
}

function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + K for search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.querySelector('input[name="q"]');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
        
        // Escape to clear search
        if (e.key === 'Escape') {
            const searchInput = document.querySelector('input[name="q"]:focus');
            if (searchInput) {
                searchInput.value = '';
                searchInput.blur();
            }
        }
    });
}

function initializeLazyLoading() {
    // Simple lazy loading for images
    const images = document.querySelectorAll('img[data-src]');
    
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy');
                    imageObserver.unobserve(img);
                }
            });
        });
        
        images.forEach(img => imageObserver.observe(img));
    } else {
        // Fallback for older browsers
        images.forEach(img => {
            img.src = img.dataset.src;
        });
    }
}

// Utility Functions

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showLoading(element) {
    if (element) {
        element.classList.add('loading');
    }
}

function hideLoading(element) {
    if (element) {
        element.classList.remove('loading');
    }
}

function showToast(message, type = 'info') {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} position-fixed`;
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    toast.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <span>${message}</span>
            <button type="button" class="btn-close" onclick="this.parentElement.parentElement.remove()"></button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

function initializeTomatoToy() {
    const root = document.getElementById('tomatoToy');
    if (!root) return;

    const dataElement = document.getElementById('tomato-toy-data');
    if (!dataElement) return;

    let varieties = [];
    try {
        varieties = JSON.parse(dataElement.textContent || '[]');
    } catch (error) {
        console.error('Unable to parse tomato toy data:', error);
        return;
    }

    if (!varieties.length) return;

    const state = {
        flavorX: 62,
        flavorY: 48,
        gardenX: 46,
        gardenY: 50,
        sweetness: 68,
        drama: 52,
        ease: 48,
        meal: 'sauce',
        location: 'any',
        season: 'any',
        query: '',
        selectedId: varieties[0].id,
        selectionLocked: false
    };

    const els = {
        specimen: document.getElementById('morphSpecimen'),
        imageWrap: document.getElementById('selectedImageWrap'),
        selectedName: document.getElementById('selectedName'),
        selectedDescription: document.getElementById('selectedDescription'),
        selectedSource: document.getElementById('selectedSource'),
        selectedTags: document.getElementById('selectedTags'),
        selectedFingerprint: document.getElementById('selectedFingerprint'),
        resultCount: document.getElementById('resultCount'),
        results: document.getElementById('tomatoResults'),
        search: document.getElementById('toySearch'),
        sweetness: document.getElementById('sweetnessRange'),
        drama: document.getElementById('dramaRange'),
        ease: document.getElementById('easeRange'),
        location: document.getElementById('locationSelect'),
        season: document.getElementById('seasonSelect'),
        perfect: document.getElementById('perfectFinderBtn')
    };

    document.querySelectorAll('[data-axis-pad]').forEach(setupAxisPad);
    document.querySelectorAll('.meal-chip').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.meal-chip').forEach(item => item.classList.remove('active'));
            button.classList.add('active');
            state.meal = button.dataset.meal || 'sauce';
            state.selectionLocked = false;
            renderToy();
        });
    });

    if (els.search) {
        els.search.addEventListener('input', debounce(event => {
            state.query = event.target.value.trim().toLowerCase();
            state.selectionLocked = false;
            renderToy();
        }, 120));
    }

    [
        [els.sweetness, 'sweetness'],
        [els.drama, 'drama'],
        [els.ease, 'ease']
    ].forEach(([input, key]) => {
        if (!input) return;
        input.addEventListener('input', event => {
            state[key] = Number(event.target.value);
            state.selectionLocked = false;
            renderToy();
        });
    });

    if (els.location) {
        els.location.addEventListener('change', event => {
            state.location = event.target.value;
            state.selectionLocked = false;
            renderToy();
        });
    }

    if (els.season) {
        els.season.addEventListener('change', event => {
            state.season = event.target.value;
            state.selectionLocked = false;
            renderToy();
        });
    }

    if (els.perfect) {
        els.perfect.addEventListener('click', () => {
            const strange = varieties
                .map(variety => ({ variety, score: (variety.attributes.visual_drama || 0) + (variety.attributes.rarity || 0) + (variety.imageUrl ? 20 : 0) }))
                .sort((a, b) => b.score - a.score);
            const pick = strange[Math.floor(Math.random() * Math.min(18, strange.length))]?.variety || varieties[0];
            state.selectedId = pick.id;
            state.selectionLocked = true;
            state.drama = Math.max(70, state.drama);
            if (els.drama) els.drama.value = state.drama;
            updateSelected(pick);
            renderToy();
        });
    }

    setAxisValue('flavor', state.flavorX, state.flavorY);
    setAxisValue('garden', state.gardenX, state.gardenY);
    renderToy();

    function setupAxisPad(pad) {
        const axis = pad.dataset.axisPad;
        setAxisValue(axis, axis === 'flavor' ? state.flavorX : state.gardenX, axis === 'flavor' ? state.flavorY : state.gardenY);

        const updateFromPointer = event => {
            const rect = pad.getBoundingClientRect();
            const x = clampNumber(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
            const y = clampNumber(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
            if (axis === 'flavor') {
                state.flavorX = x;
                state.flavorY = y;
            } else {
                state.gardenX = x;
                state.gardenY = y;
            }
            state.selectionLocked = false;
            setAxisValue(axis, x, y);
            renderToy();
        };

        pad.addEventListener('pointerdown', event => {
            pad.setPointerCapture(event.pointerId);
            updateFromPointer(event);
        });
        pad.addEventListener('pointermove', event => {
            if (event.buttons !== 1) return;
            updateFromPointer(event);
        });
    }

    function setAxisValue(axis, x, y) {
        const pad = document.querySelector(`[data-axis-pad="${axis}"]`);
        if (!pad) return;
        pad.style.setProperty('--x', x);
        pad.style.setProperty('--y', y);
    }

    function renderToy() {
        const ranked = rankVarieties();
        const locked = state.selectionLocked ? ranked.find(item => item.variety.id === state.selectedId)?.variety : null;
        const selected = locked || ranked[0]?.variety || varieties[0];
        if (selected) {
            state.selectedId = selected.id;
            updateSelected(selected);
        }
        renderResults(ranked.slice(0, 12));
        if (els.resultCount) {
            els.resultCount.textContent = `${ranked.length.toLocaleString()} cataloged specimens`;
        }
    }

    function rankVarieties() {
        return varieties
            .map(variety => ({ variety, score: scoreVariety(variety) }))
            .filter(item => item.score > -200)
            .sort((a, b) => b.score - a.score);
    }

    function scoreVariety(variety) {
        const a = variety.attributes || {};
        const searchable = [
            variety.name,
            variety.description,
            Object.values(variety.fields || {}).join(' '),
            (variety.taxonomy || []).join(' ')
        ].join(' ').toLowerCase();

        let score = 0;
        score += closeness(a.sweetness, state.sweetness) * 0.85;
        score += closeness(a.sweetness, state.flavorX) * 0.28;
        score += closeness(a.acidity, 100 - state.flavorX) * 0.2;
        score += closeness(a.flesh_density, state.flavorY) * 0.34;
        score += closeness(a.juiciness, 100 - state.flavorY) * 0.28;
        score += closeness(a.visual_drama, state.drama) * 0.48;
        score += closeness(a.garden_ease, state.ease) * 0.36;
        score += closeness(a.container_fit, 100 - state.gardenX) * 0.22;
        score += closeness(a.late_season, state.gardenY) * 0.28;
        score += (a[state.meal] || 0) * 0.9;
        score += locationScore(a) * 0.56;
        score += seasonScore(a) * 0.54;
        score += (a.rarity || 0) * 0.1;
        score += variety.imageUrl ? 28 : 0;

        if (state.query) {
            if (searchable.includes(state.query)) {
                score += searchable.startsWith(state.query) ? 62 : 32;
            } else {
                score -= 220;
            }
        }

        return Math.round(score);
    }

    function locationScore(a) {
        switch (state.location) {
            case 'northeast':
                return ((a.disease_resistance || 0) * 0.45) + ((a.early_season || 0) * 0.28) + ((a.cold_tolerance || 0) * 0.27);
            case 'humid':
                return ((a.disease_resistance || 0) * 0.72) + ((a.crack_resistance || 0) * 0.28);
            case 'hot':
                return ((a.heat_tolerance || 0) * 0.72) + ((a.shelf_life || 0) * 0.18) + ((a.garden_ease || 0) * 0.1);
            case 'cool':
                return ((a.early_season || 0) * 0.6) + ((a.cold_tolerance || 0) * 0.4);
            case 'container':
                return ((a.container_fit || 0) * 0.76) + ((a.garden_ease || 0) * 0.24);
            default:
                return 52;
        }
    }

    function seasonScore(a) {
        switch (state.season) {
            case 'spring':
                return ((a.garden_ease || 0) * 0.5) + ((a.early_season || 0) * 0.5);
            case 'early':
                return a.early_season || 0;
            case 'peak':
                return ((a.salad || 0) * 0.34) + ((a.sandwich || 0) * 0.34) + ((a.visual_drama || 0) * 0.32);
            case 'late':
                return ((a.late_season || 0) * 0.72) + ((a.shelf_life || 0) * 0.28);
            case 'winter':
                return ((a.sauce || 0) * 0.42) + ((a.canning || 0) * 0.38) + ((a.shelf_life || 0) * 0.2);
            default:
                return 52;
        }
    }

    function updateSelected(variety) {
        const a = variety.attributes || {};
        const color = variety.color || { primary: '#b7352c', secondary: '#e35b3f' };

        root.style.setProperty('--tomato-primary', color.primary);
        root.style.setProperty('--tomato-secondary', color.secondary);
        root.style.setProperty('--morph-scale', String(0.88 + ((a.size_score || 50) / 380)));
        root.style.setProperty('--rib-strength', String((a.visual_drama || 40) / 100));
        root.style.setProperty('--rib-opacity', String(0.12 + ((a.visual_drama || 40) / 220)));
        root.style.setProperty('--morph-tilt', `${((a.rarity || 50) - 50) / 9}deg`);
        root.style.setProperty('--morph-radius', shapeRadius(variety));

        if (els.specimen) {
            els.specimen.classList.remove('morphing');
            void els.specimen.offsetWidth;
            els.specimen.classList.add('morphing');
            window.setTimeout(() => els.specimen?.classList.remove('morphing'), 520);
        }

        if (els.imageWrap) {
            els.imageWrap.innerHTML = variety.imageUrl
                ? `<img id="selectedImage" src="${escapeHtml(variety.imageUrl)}" alt="${escapeHtml(variety.imageAlt || variety.name)}">`
                : '<div id="selectedImage" class="image-fallback"></div>';
        }

        if (els.selectedName) els.selectedName.textContent = variety.name || 'Tomato';
        if (els.selectedDescription) {
            els.selectedDescription.textContent = variety.description || buildFallbackDescription(variety);
        }
        if (els.selectedSource) {
            els.selectedSource.textContent = variety.imageSource || 'Image slot pending';
        }
        if (els.selectedTags) {
            els.selectedTags.innerHTML = (variety.taxonomy || [])
                .slice(0, 6)
                .map(tag => `<span>${escapeHtml(tag)}</span>`)
                .join('');
        }
        if (els.selectedFingerprint) {
            els.selectedFingerprint.innerHTML = fingerprintCells(variety);
        }
    }

    function renderResults(items) {
        if (!els.results) return;

        els.results.innerHTML = items.map(({ variety, score }) => {
            const a = variety.attributes || {};
            const active = variety.id === state.selectedId ? ' active' : '';
            const media = variety.imageUrl
                ? `<img src="${escapeHtml(variety.imageUrl)}" alt="${escapeHtml(variety.imageAlt || variety.name)}" loading="lazy">`
                : '<div class="image-fallback"></div>';
            const tags = (variety.taxonomy || []).slice(0, 3).map(tag => `<span>${escapeHtml(tag)}</span>`).join('');

            return `
                <article class="toy-card${active}" data-variety-id="${escapeHtml(variety.id)}" tabindex="0" role="button" aria-label="Select ${escapeHtml(variety.name)}">
                    <div class="toy-card-media" style="--card-primary:${escapeHtml(variety.color?.primary || '#b7352c')}; --card-secondary:${escapeHtml(variety.color?.secondary || '#e35b3f')};">
                        ${media}
                        <span class="toy-card-score">${score}</span>
                    </div>
                    <div class="toy-card-body">
                        <h3>${escapeHtml(variety.name)}</h3>
                        <p>${escapeHtml(variety.description || buildFallbackDescription(variety))}</p>
                        <div class="toy-card-metrics">
                            <span style="--metric-color:${escapeHtml(variety.color?.primary || '#b7352c')}">Sweet ${Math.round(a.sweetness || 0)}</span>
                            <span style="--metric-color:#456c43">Use ${Math.round(a[state.meal] || 0)}</span>
                            <span style="--metric-color:#466a76">Odd ${Math.round(a.visual_drama || 0)}</span>
                        </div>
                        <div class="card-tags">${tags}</div>
                    </div>
                </article>
            `;
        }).join('');

        els.results.querySelectorAll('.toy-card').forEach(card => {
            const select = () => {
                const id = card.getAttribute('data-variety-id');
                const variety = varieties.find(item => item.id === id);
                if (!variety) return;
                state.selectedId = variety.id;
                state.selectionLocked = true;
                updateSelected(variety);
                els.results.querySelectorAll('.toy-card').forEach(item => item.classList.toggle('active', item === card));
            };
            card.addEventListener('click', select);
            card.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    select();
                }
            });
        });
    }

    function shapeRadius(variety) {
        const shape = String(variety.fields?.fruit_shape || '').toLowerCase();
        if (shape.includes('pear')) return '56% 44% 62% 38% / 43% 44% 56% 57%';
        if (shape.includes('bell')) return '44% 56% 43% 57% / 33% 34% 66% 67%';
        if (shape.includes('heart')) return '52% 48% 61% 39% / 42% 41% 59% 58%';
        if (shape.includes('flattened')) return '56% 44% 48% 52% / 38% 36% 64% 62%';
        if (shape.includes('cherry')) return '50%';
        if (shape.includes('beefsteak')) return '48% 52% 42% 58% / 50% 46% 54% 50%';
        return '52% 48% 46% 54% / 55% 52% 48% 45%';
    }

    function buildFallbackDescription(variety) {
        const fields = variety.fields || {};
        return [fields.fruit_shape, fields.skin_color, fields.taste, fields.season]
            .filter(Boolean)
            .join(' / ') || 'A cataloged tomato specimen waiting for more notes.';
    }

    function fingerprintCells(variety) {
        const a = variety.attributes || {};
        const cells = [
            ['Sweet', a.sweetness, '#d44a35'],
            ['Acid', a.acidity, '#c89537'],
            ['Umami', a.umami, '#6c4a61'],
            ['Juice', a.juiciness, '#466a76'],
            ['Density', a.flesh_density, '#8f4b32'],
            ['Drama', a.visual_drama, '#9a5a2f'],
            ['Rarity', a.rarity, '#456c43'],
            ['Ease', a.garden_ease, '#567f4b']
        ];
        return cells.map(([label, value, color]) => `
            <div class="fingerprint-cell">
                <span>${label} ${Math.round(value || 0)}</span>
                <div class="fingerprint-track" style="--bar-color:${color}; --value:${Math.round(value || 0)}"><i></i></div>
            </div>
        `).join('');
    }
}

function closeness(value, target) {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.max(0, 100 - Math.abs(value - target));
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

// API Helper Functions

async function apiCall(endpoint, options = {}) {
    try {
        showLoading(document.body);
        
        const response = await fetch(`/api${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'API request failed');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        showToast(`Error: ${error.message}`, 'danger');
        throw error;
    } finally {
        hideLoading(document.body);
    }
}

// Global functions for inline event handlers

window.refreshData = async function() {
    try {
        const data = await apiCall('/refresh');
        showToast(`Data refreshed! Found ${data.total_varieties} varieties.`, 'success');
        setTimeout(() => location.reload(), 1500);
    } catch (error) {
        // Error already shown by apiCall
    }
};

window.refreshStats = async function() {
    try {
        const data = await apiCall('/refresh');
        showToast('Statistics refreshed!', 'success');
        setTimeout(() => location.reload(), 1500);
    } catch (error) {
        // Error already shown by apiCall
    }
};

// Search functionality
window.performSearch = async function(query) {
    if (!query.trim()) {
        showToast('Please enter a search term', 'warning');
        return;
    }
    
    try {
        const data = await apiCall(`/search?q=${encodeURIComponent(query)}`);
        
        if (data.total_found === 0) {
            showToast('No varieties found matching your search', 'info');
        } else {
            showToast(`Found ${data.total_found} varieties`, 'success');
        }
        
        return data;
    } catch (error) {
        // Error already shown by apiCall
    }
};

// Console welcome message
console.log(`
🍅 Welcome to Tomato Varieties Database!
🔧 Developer Tools Available:
   - refreshData() - Refresh the database
   - performSearch(query) - Search varieties
   - apiCall(endpoint) - Make API calls
   
📚 Keyboard Shortcuts:
   - Ctrl/Cmd + K - Focus search
   - Escape - Clear search
`);
// Beautiful Loading Overlay Functions for Tomato Database
function showLoadingOverlay(type, text) {
    if (!document.getElementById("loadingOverlay")) {
        const overlay = document.createElement("div");
        overlay.id = "loadingOverlay";
        overlay.className = "loading-overlay";
        overlay.innerHTML = `
            <div id="loaderContent"></div>
            <div class="loading-text" id="loadingText"></div>
        `;
        document.body.appendChild(overlay);
    }
    
    updateLoadingOverlay(type, text);
    document.getElementById("loadingOverlay").classList.add("active");
}

function updateLoadingOverlay(type, text) {
    const content = document.getElementById("loaderContent");
    const textEl = document.getElementById("loadingText");
    
    content.innerHTML = "";
    
    switch(type) {
        case "tomato":
            content.innerHTML = "<div class=\"tomato-spinner\"></div>";
            break;
        case "plant":
        default:  // Make plant the default animation
            content.innerHTML = `
                <div class="plant-loader">
                    <span class="plant-stage">🌱</span>
                    <span class="plant-stage">🌿</span>
                    <span class="plant-stage">🍃</span>
                    <span class="plant-stage">🍅</span>
                </div>
            `;
            break;
        case "ripple":
            content.innerHTML = `
                <div class="water-ripple">
                    <div class="ripple-circle"></div>
                    <div class="ripple-circle"></div>
                    <div class="ripple-circle"></div>
                </div>
            `;
            break;
    }
    
    textEl.textContent = text;
}

function hideLoadingOverlay() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.classList.remove("active");
    }
}


// Global navigation loading with growing plants
document.addEventListener("DOMContentLoaded", function() {
    // Add growing plant loading to all internal navigation links
    const internalLinks = document.querySelectorAll("a[href^=\"/\"]:not([href^=\"//\"]):not([target=\"_blank\"])");
    
    internalLinks.forEach(link => {
        link.addEventListener("click", function(e) {
            const href = this.getAttribute("href");
            
            // Skip if its a hash link or external
            if (href.startsWith("#") || href.includes("://")) {
                return;
            }
            
            // Show appropriate loading message based on destination
            let message = "Growing fresh content...";
            
            if (href === "/" || href.includes("home")) {
                message = "Growing tomato garden...";
            } else if (href.includes("search")) {
                message = "Growing search results...";
            } else if (href.includes("tomato/")) {
                message = "Loading variety details...";
            } else if (href.includes("stats")) {
                message = "Growing statistics...";
            } else if (href.includes("loading-demo")) {
                message = "Growing animation demos...";
            }
            
            if (typeof showLoadingOverlay === "function") {
                showLoadingOverlay("plant", message);
            }
        });
    });
    
    // Add loading to form submissions
    const forms = document.querySelectorAll("form");
    forms.forEach(form => {
        form.addEventListener("submit", function(e) {
            const action = this.getAttribute("action") || "";
            let message = "Processing request...";
            
            if (action.includes("search")) {
                message = "Growing search results...";
            }
            
            if (typeof showLoadingOverlay === "function") {
                showLoadingOverlay("plant", message);
            }
        });
    });
});

// Helper function for quick plant loading
window.showPlantLoading = function(message = "Growing fresh content...") {
    if (typeof showLoadingOverlay === "function") {
        showLoadingOverlay("plant", message);
    }
};

window.hidePlantLoading = function() {
    if (typeof hideLoadingOverlay === "function") {
        hideLoadingOverlay();
    }
};

