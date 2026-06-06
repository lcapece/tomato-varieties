const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helper function to make API calls
async function callAPI(endpoint) {
    try {
        const response = await axios.get(`${API_BASE_URL}${endpoint}`);
        return response.data;
    } catch (error) {
        console.error(`API Error for ${endpoint}:`, error.message);
        return { error: error.message };
    }
}

const FIELD_LABELS = [
    ['tomato_type', 'Tomato Type'],
    ['breed', 'Breed'],
    ['season', 'Season'],
    ['leaf_type', 'Leaf Type'],
    ['plant_type', 'Plant Type'],
    ['plant_height', 'Plant Height'],
    ['fruit_size', 'Fruit Size'],
    ['fruit_shape', 'Fruit Shape'],
    ['skin_color', 'Skin Color'],
    ['flesh_color', 'Flesh Color'],
    ['taste', 'Taste'],
    ['usage', 'Usage'],
    ['availability', 'Availability'],
    ['disease_resistance', 'Disease Resistance'],
    ['origin', 'Origin'],
    ['comments', 'Comments']
];

function compactText(value = '') {
    return String(value)
        .replace(/\s+/g, ' ')
        .replace(/\s+([:,.])/g, '$1')
        .trim();
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripBoilerplate(value = '') {
    return compactText(value)
        .replace(/\bNote: Comments followed by "\?" are from seed catalog descriptions\. You decide if you agree\./i, '')
        .replace(/\bVariety Search:\s*$/i, '')
        .replace(/\bVariety Search:\s*/gi, '')
        .trim();
}

function parseVarietyFields(variety) {
    let raw = compactText([
        variety.raw_text,
        variety.description,
        Object.values(variety.characteristics || {}).join(' ')
    ].filter(Boolean).join(' '));

    raw = raw.replace(/^Home Tomato Varieties\s+/i, '');
    raw = raw.replace(/\bZoom in\b/gi, '');
    raw = raw.replace(/\bPhoto by\b.*?(?=(Tomato Type|Breed|Season|Leaf Type|Plant Type|Plant Height|Fruit Size|Fruit Shape|Skin Color|Flesh Color|Taste|Usage|Availability|Disease Resistance|Origin|Comments):|$)/i, '');

    if (variety.name) {
        raw = raw.replace(new RegExp(`^${escapeRegExp(variety.name)}\\s*`, 'i'), '');
    }

    const matches = [];
    FIELD_LABELS.forEach(([key, label]) => {
        const regex = new RegExp(`${escapeRegExp(label)}\\s*:`, 'gi');
        let match;
        while ((match = regex.exec(raw))) {
            matches.push({ key, label, index: match.index, end: regex.lastIndex });
        }
    });

    matches.sort((a, b) => a.index - b.index);

    const fields = {};
    matches.forEach((match, index) => {
        const next = matches[index + 1];
        const value = stripBoilerplate(raw.slice(match.end, next ? next.index : raw.length));
        if (value && !fields[match.key]) {
            fields[match.key] = value;
        }
    });

    return fields;
}

function hasAny(text, words) {
    const haystack = compactText(text).toLowerCase();
    return words.some(word => haystack.includes(word));
}

function numberFrom(value) {
    const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
}

function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
}

function colorProfile(skinColor = '', fleshColor = '') {
    const joined = `${skinColor} ${fleshColor}`.toLowerCase();
    if (joined.includes('black')) return { primary: '#3a2524', secondary: '#8f3f38', label: 'black' };
    if (joined.includes('purple')) return { primary: '#5a344d', secondary: '#b14f6f', label: 'purple' };
    if (joined.includes('green')) return { primary: '#5f7f3d', secondary: '#c3c25d', label: 'green' };
    if (joined.includes('yellow')) return { primary: '#e1b739', secondary: '#f7d76e', label: 'yellow' };
    if (joined.includes('orange')) return { primary: '#d86d31', secondary: '#f1aa43', label: 'orange' };
    if (joined.includes('pink')) return { primary: '#c45667', secondary: '#ef9a9a', label: 'pink' };
    if (joined.includes('bi-color') || joined.includes('bicolor')) return { primary: '#c84b3a', secondary: '#e0be45', label: 'bi-color' };
    if (joined.includes('white')) return { primary: '#ddd1ad', secondary: '#f6e7c1', label: 'white' };
    return { primary: '#b7352c', secondary: '#e35b3f', label: 'red' };
}

function deriveAttributes(fields, variety, index) {
    const text = compactText([
        variety.name,
        variety.description,
        variety.raw_text,
        Object.values(fields).join(' ')
    ].join(' '));
    const lower = text.toLowerCase();
    const sizeOz = numberFrom(fields.fruit_size);
    const shape = (fields.fruit_shape || '').toLowerCase();
    const type = (fields.tomato_type || '').toLowerCase();
    const breed = (fields.breed || '').toLowerCase();
    const season = (fields.season || '').toLowerCase();
    const plantType = (fields.plant_type || '').toLowerCase();
    const colors = colorProfile(fields.skin_color, fields.flesh_color);

    const sweet = hasAny(lower, ['sweet', 'honey', 'sugar']) ? 86 : hasAny(lower, ['mild']) ? 58 : 68;
    const acid = hasAny(lower, ['acid', 'tangy', 'tart', 'zesty']) ? 82 : hasAny(lower, ['mild', 'low acid']) ? 36 : 58;
    const meaty = hasAny(lower, ['meaty', 'solid', 'paste', 'plum', 'roma', 'dense']);
    const cherry = shape.includes('cherry') || type.includes('cherry');
    const beefsteak = shape.includes('beefsteak') || (sizeOz && sizeOz >= 12);
    const paste = shape.includes('paste') || hasAny(lower, ['paste', 'roma', 'plum', 'sauce']);
    const dark = hasAny(`${fields.skin_color} ${fields.flesh_color}`, ['black', 'purple', 'brown']);
    const striped = hasAny(lower, ['stripe', 'striped', 'bi-color', 'bicolor', 'zebra']);
    const disease = fields.disease_resistance ? 78 : hasAny(lower, ['resistant', 'wilt', 'nematode']) ? 66 : 28;

    const visualDrama = clamp(
        (striped ? 34 : 0) +
        (dark ? 22 : 0) +
        (hasAny(lower, ['green', 'yellow', 'orange', 'white']) ? 14 : 0) +
        (hasAny(shape, ['ribbed', 'pear', 'bell', 'heart', 'oxheart']) ? 18 : 0) +
        (beefsteak ? 8 : 0) +
        24
    );

    const density = clamp((meaty ? 82 : 52) + (paste ? 10 : 0) + (cherry ? -18 : 0));
    const juiciness = clamp(100 - density + (cherry ? 24 : 0) + (beefsteak ? 8 : 0));
    const umami = clamp(50 + (dark ? 22 : 0) + (meaty ? 16 : 0) + (hasAny(lower, ['rich', 'tomato flavor', 'full flavor']) ? 14 : 0));

    const early = season.includes('early') ? 90 : season.includes('mid') ? 55 : season.includes('late') ? 22 : 48;
    const late = season.includes('late') ? 88 : season.includes('mid') ? 58 : season.includes('early') ? 28 : 50;
    const compact = plantType.includes('determinate') ? 76 : plantType.includes('semi') ? 58 : 34;

    return {
        sweetness: sweet,
        acidity: acid,
        bitterness: hasAny(lower, ['bitter']) ? 72 : hasAny(fields.skin_color, ['green']) ? 30 : 12,
        umami,
        aroma: clamp(42 + (hasAny(lower, ['fragrant', 'aromatic', 'rich']) ? 24 : 0) + (breed.includes('open') ? 8 : 0)),
        juiciness,
        flesh_density: density,
        skin_thickness: clamp(44 + (hasAny(lower, ['crack', 'commercial', 'shipping']) ? 18 : 0) + (cherry ? -8 : 0)),
        seediness: clamp(48 + (cherry ? 12 : 0) + (paste ? -18 : 0)),
        size_score: clamp(sizeOz ? sizeOz * 7 : cherry ? 18 : 52),
        visual_drama: visualDrama,
        rarity: clamp(30 + (breed.includes('open') ? 14 : 0) + (type.includes('heirloom') ? 24 : 0) + (visualDrama > 60 ? 18 : 0) + (index % 13)),
        early_season: early,
        late_season: late,
        heat_tolerance: clamp(42 + (hasAny(lower, ['heat', 'southern', 'texas']) ? 34 : 0) + (season.includes('late') ? 10 : 0)),
        cold_tolerance: clamp(38 + (season.includes('early') ? 22 : 0) + (hasAny(lower, ['cold', 'siberian', 'sub-arctic']) ? 34 : 0)),
        disease_resistance: disease,
        crack_resistance: clamp(36 + (hasAny(lower, ['crack resistant', 'crack']) ? 24 : 0) + (disease > 60 ? 12 : 0)),
        container_fit: clamp(compact + (numberFrom(fields.plant_height) && numberFrom(fields.plant_height) <= 3 ? 18 : 0)),
        garden_ease: clamp(42 + (plantType.includes('determinate') ? 18 : 0) + (disease > 60 ? 18 : 0) + (breed.includes('hybrid') ? 8 : 0)),
        shelf_life: clamp(40 + (hasAny(lower, ['commercial', 'firm', 'storage', 'shipping']) ? 26 : 0) + (paste ? 10 : 0)),
        sauce: clamp(36 + (paste ? 42 : 0) + (meaty ? 18 : 0) + (juiciness < 45 ? 10 : 0)),
        slicing: clamp(38 + (beefsteak ? 38 : 0) + (shape.includes('globe') ? 18 : 0) + (sizeOz && sizeOz >= 8 ? 14 : 0)),
        roasting: clamp(42 + (density > 65 ? 24 : 0) + (sweet > 75 ? 12 : 0)),
        canning: clamp(36 + (paste ? 34 : 0) + (density > 65 ? 14 : 0) + (acid > 60 ? 12 : 0)),
        salad: clamp(42 + (cherry ? 34 : 0) + (sweet > 75 ? 16 : 0) + (visualDrama > 60 ? 8 : 0)),
        sandwich: clamp(38 + (beefsteak ? 36 : 0) + (slicingScoreBonus(shape, sizeOz))),
        salsa: clamp(42 + (acid > 60 ? 18 : 0) + (density > 58 ? 16 : 0) + (cherry ? 6 : 0)),
        pizza: clamp(38 + (paste ? 34 : 0) + (umami > 65 ? 16 : 0)),
        soup: clamp(46 + (juiciness > 55 ? 14 : 0) + (umami > 60 ? 12 : 0)),
        snack: clamp(40 + (cherry ? 36 : 0) + (sweet > 75 ? 18 : 0)),
        fine_dining: clamp(34 + (visualDrama > 65 ? 30 : 0) + (umami > 68 ? 14 : 0) + (type.includes('heirloom') ? 12 : 0))
    };
}

function slicingScoreBonus(shape, sizeOz) {
    let bonus = 0;
    if (shape.includes('round') || shape.includes('flattened')) bonus += 12;
    if (sizeOz && sizeOz >= 6) bonus += 12;
    return bonus;
}

function enhanceVariety(variety, index) {
    const fields = parseVarietyFields(variety);
    const colors = colorProfile(fields.skin_color, fields.flesh_color);
    const attributes = deriveAttributes(fields, variety, index);
    const image = Array.isArray(variety.images) && variety.images.length ? variety.images[0] : null;
    const imageUrl = image && !/njaes\.rutgers\.edu\/tomato-varieties\/images\//i.test(image.url) ? image.url : '';
    const comment = stripBoilerplate(fields.comments || '');

    return {
        id: variety.slug || variety.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: variety.name,
        slug: variety.slug || '',
        url: variety.url || '',
        imageUrl,
        imageAlt: image ? image.alt : '',
        imageSource: imageUrl ? 'Wikimedia image slot' : 'Wikimedia image pending',
        description: comment || stripBoilerplate(variety.description || ''),
        fields,
        attributes,
        color: colors,
        taxonomy: [
            fields.tomato_type,
            fields.breed,
            fields.season,
            fields.fruit_shape,
            fields.skin_color
        ].filter(Boolean)
    };
}

// Routes

// Home page - Display all tomato varieties
app.get('/', async (req, res) => {
    try {
        const data = await callAPI('/varieties');
        
        if (data.error) {
            return res.render('error', { 
                error: data.error,
                message: 'Failed to load tomato varieties. Make sure the Python API is running.'
            });
        }
        
        const rawVarieties = data.varieties || [];
        const toyVarieties = rawVarieties.map(enhanceVariety);
        const imageCount = toyVarieties.filter(variety => variety.imageUrl).length;
        
        res.render('index', { 
            varieties: rawVarieties,
            toyVarieties,
            totalCount: data.total_count || 0,
            scrapedAt: data.scraped_at || '',
            source: data.source || '',
            toyStats: {
                imageCount,
                attributeCount: 52,
                sourceCount: rawVarieties.length,
                wikimediaReadyCount: toyVarieties.length - imageCount
            }
        });
    } catch (error) {
        res.render('error', { 
            error: 'Connection Error',
            message: 'Could not connect to the API. Make sure the Python backend is running on port 5000.'
        });
    }
});

// Search page
app.get('/search', async (req, res) => {
    const query = req.query.q || '';
    
    if (!query) {
        return res.render('search', { 
            query: '',
            results: [],
            totalFound: 0
        });
    }
    
    try {
        const data = await callAPI(`/search?q=${encodeURIComponent(query)}`);
        
        res.render('search', { 
            query: query,
            results: data.results || [],
            totalFound: data.total_found || 0,
            error: data.error || null
        });
    } catch (error) {
        res.render('search', { 
            query: query,
            results: [],
            totalFound: 0,
            error: 'Search failed. Please try again.'
        });
    }
});

// Individual tomato variety page (dynamic route)
app.get('/tomato/:identifier', async (req, res) => {
    const identifier = req.params.identifier;
    
    try {
        const data = await callAPI(`/variety/${encodeURIComponent(identifier)}`);
        
        if (data.error) {
            return res.render('error', { 
                error: 'Variety Not Found',
                message: `No tomato variety found with name or slug: "${identifier}"`
            });
        }
        
        res.render('variety-detail', { 
            variety: data,
            identifier: identifier
        });
    } catch (error) {
        res.render('error', { 
            error: 'Error Loading Variety',
            message: 'Could not load the tomato variety details.'
        });
    }
});

// Stats page
app.get('/stats', async (req, res) => {
    try {
        const data = await callAPI('/stats');
        
        if (data.error) {
            return res.render('error', { 
                error: data.error,
                message: 'Failed to load statistics.'
            });
        }
        
        res.render('stats', { stats: data });
    } catch (error) {
        res.render('error', { 
            error: 'Stats Error',
            message: 'Could not load statistics.'
        });
    }
});

// Loading Animations Demo page
app.get('/loading-demo', (req, res) => {
    res.render('loading-demo');
});

app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// API proxy routes (for AJAX calls from frontend)
app.get('/api/varieties', async (req, res) => {
    const data = await callAPI('/varieties');
    res.json(data);
});

app.get('/api/varieties/:identifier', async (req, res) => {
    const data = await callAPI(`/variety/${req.params.identifier}`);
    res.json(data);
});

app.get('/api/search', async (req, res) => {
    const query = req.query.q || '';
    const data = await callAPI(`/search?q=${encodeURIComponent(query)}`);
    res.json(data);
});

app.get('/api/refresh', async (req, res) => {
    const data = await callAPI('/refresh');
    res.json(data);
});

// Scraper control endpoints
app.post('/api/scrape', async (req, res) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/scrape`);
        res.json(response.data);
    } catch (error) {
        console.error('Scraper start error:', error.message);
        res.json({ error: error.message });
    }
});

app.get('/api/scrape/status', async (req, res) => {
    const data = await callAPI('/scrape/status');
    res.json(data);
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        error: '404 - Page Not Found',
        message: `The page "${req.url}" was not found.`
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🍅 Tomato Varieties Frontend Server running on port ${PORT}`);
    console.log(`📱 Open your browser to: http://localhost:${PORT}`);
    console.log(`🔗 API Backend should be running on: ${API_BASE_URL}`);
    console.log('');
    console.log('Available routes:');
    console.log('  GET  /                     - Home page (all varieties)');
    console.log('  GET  /search?q=<query>     - Search varieties');
    console.log('  GET  /tomato/<name>        - Individual variety details');
    console.log('  GET  /stats                - Database statistics');
    console.log('  GET  /api/*                - API proxy endpoints');
});
