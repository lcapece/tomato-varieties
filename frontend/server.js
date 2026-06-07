const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';
const WIKIMEDIA_CACHE_PATH = path.join(__dirname, '..', 'backend', 'wikimedia_images.json');

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
        .replace(/\bPhoto by\b.*$/i, '')
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

let wikimediaImageCache = null;
let wikimediaImageCacheMtime = 0;

function loadWikimediaImageCache() {
    try {
        const stat = fs.statSync(WIKIMEDIA_CACHE_PATH);
        if (wikimediaImageCache && stat.mtimeMs === wikimediaImageCacheMtime) {
            return wikimediaImageCache;
        }
        const raw = fs.readFileSync(WIKIMEDIA_CACHE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        wikimediaImageCache = parsed.items || {};
        wikimediaImageCacheMtime = stat.mtimeMs;
        return wikimediaImageCache;
    } catch {
        wikimediaImageCache = {};
        wikimediaImageCacheMtime = 0;
        return wikimediaImageCache;
    }
}

function getWikimediaImage(name) {
    const cache = loadWikimediaImageCache();
    const item = cache[name];
    if (!item || item.status !== 'matched' || !item.thumb_url) {
        return null;
    }
    return item;
}

function buildVarietySummary(fields) {
    const parts = [];
    if (fields.taste) parts.push(`${fields.taste} flavor`);
    if (fields.fruit_size || fields.fruit_shape) {
        parts.push([fields.fruit_size, fields.fruit_shape].filter(Boolean).join(' '));
    }
    if (fields.skin_color || fields.flesh_color) {
        parts.push(`${[fields.skin_color, fields.flesh_color].filter(Boolean).join(' / ')} color`);
    }
    if (fields.season) parts.push(`${fields.season} season`);
    return parts.join('. ');
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
    const market = deriveMarketAvailability(fields, {
        type,
        breed,
        season,
        plantType,
        disease,
        earlySeason: season.includes('early'),
        lateSeason: season.includes('late'),
        paste,
        cherry,
        beefsteak
    });

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
    const plantHeightFt = numberFrom(fields.plant_height) || 0;
    const fruitWeightOz = sizeOz || 0;
    const determinate = plantType.includes('determinate') && !plantType.includes('indeterminate');
    const indeterminate = plantType.includes('indeterminate');
    const semiDeterminate = plantType.includes('semi');
    const heirloom = type.includes('heirloom');
    const hybrid = breed.includes('hybrid');
    const openPollinated = breed.includes('open');
    const redPink = hasAny(`${fields.skin_color} ${fields.flesh_color}`, ['red', 'pink']);
    const yellowOrange = hasAny(`${fields.skin_color} ${fields.flesh_color}`, ['yellow', 'orange']);
    const green = hasAny(`${fields.skin_color} ${fields.flesh_color}`, ['green']);
    const white = hasAny(`${fields.skin_color} ${fields.flesh_color}`, ['white']);
    const bicolor = hasAny(`${fields.skin_color} ${fields.flesh_color}`, ['bi-color', 'bicolor']);
    const grape = shape.includes('grape');
    const pear = shape.includes('pear');
    const globe = shape.includes('globe') || shape.includes('round');
    const heart = shape.includes('heart');
    const ribbed = hasAny(shape, ['ribbed', 'ruffled', 'fluted']);
    const largeFruit = fruitWeightOz >= 8 || beefsteak;
    const smallFruit = cherry || grape || fruitWeightOz <= 2;
    const fieldCompleteness = clamp((Object.keys(fields).length / FIELD_LABELS.length) * 100);

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
        market_likelihood: market.overall,
        northeast_market_likelihood: market.northeast,
        humid_market_likelihood: market.humid,
        hot_market_likelihood: market.hot,
        cool_market_likelihood: market.cool,
        container_market_likelihood: market.container,
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
        fine_dining: clamp(34 + (visualDrama > 65 ? 30 : 0) + (umami > 68 ? 14 : 0) + (type.includes('heirloom') ? 12 : 0)),
        plant_height_ft: plantHeightFt,
        plant_height_score: clamp(plantHeightFt ? plantHeightFt * 13 : compact),
        fruit_weight_oz: fruitWeightOz,
        fruit_weight_score: clamp(fruitWeightOz ? fruitWeightOz * 7 : smallFruit ? 18 : 52),
        field_completeness: fieldCompleteness,
        description_richness: clamp(compactText(fields.comments || variety.description || '').length / 2),
        image_readiness: Array.isArray(variety.images) && variety.images.length ? 72 : 24,
        cultivar_specificity: clamp(fieldCompleteness + (commentSignal(fields.comments) ? 14 : 0)),
        cherry_type: cherry ? 100 : 0,
        grape_type: grape ? 100 : 0,
        beefsteak_type: beefsteak ? 100 : 0,
        paste_type: paste ? 100 : 0,
        slicer_type: beefsteak || globe || largeFruit ? 82 : 34,
        pear_shape: pear ? 100 : 0,
        globe_shape: globe ? 100 : 0,
        heart_shape: heart ? 100 : 0,
        ribbed_shape: ribbed ? 100 : 0,
        striped_skin: striped ? 100 : 0,
        dark_skin: dark ? 100 : 0,
        green_when_ripe: green ? 100 : 0,
        yellow_or_orange: yellowOrange ? 100 : 0,
        red_or_pink: redPink ? 100 : 0,
        white_or_cream: white ? 100 : 0,
        bicolor_pattern: bicolor ? 100 : 0,
        heirloom_score: heirloom ? 100 : 22,
        hybrid_score: hybrid ? 100 : 18,
        open_pollinated_score: openPollinated ? 100 : 24,
        determinate_score: determinate ? 100 : 0,
        indeterminate_score: indeterminate ? 100 : 0,
        semi_determinate_score: semiDeterminate ? 100 : 0,
        novelty_score: clamp(visualDrama + (rareNameSignal(variety.name) ? 10 : 0)),
        grocery_fit: clamp(market.overall + (hybrid ? 12 : 0) + (largeFruit || cherry ? 6 : 0)),
        farmers_market_fit: clamp(42 + (heirloom ? 24 : 0) + (visualDrama > 55 ? 20 : 0) + (openPollinated ? 8 : 0)),
        seed_catalog_fit: clamp(42 + (openPollinated ? 24 : 0) + (heirloom ? 16 : 0) + (noveltySignal(lower) ? 12 : 0)),
        csa_fit: clamp(44 + (garden_easeScore(plantType, disease, hybrid) / 3) + (visualDrama > 55 ? 10 : 0)),
        restaurant_fit: clamp(34 + (fineDiningScore(visualDrama, umami, heirloom)) + (density > 65 ? 8 : 0)),
        kid_friendly: clamp(36 + (sweet > 75 ? 26 : 0) + (cherry || grape ? 28 : 0) - (acid > 75 ? 10 : 0)),
        preservation_fit: clamp(34 + (paste ? 32 : 0) + (canningScore(paste, density, acid) / 3)),
        raw_eating_fit: clamp(40 + (sweet > 72 ? 18 : 0) + (juiciness > 52 ? 14 : 0) + (acid < 70 ? 8 : 0)),
        sauce_body: clamp(density + (paste ? 16 : 0) + (umami > 65 ? 8 : 0)),
        fresh_market_fit: clamp(market.overall + (visualDrama > 55 ? 8 : 0) + (shelfLifeScore(lower, paste) / 4)),
        patio_fit: clamp(compact + (smallFruit ? 12 : 0) - (plantHeightFt > 5 ? 16 : 0)),
        trellis_need: clamp((indeterminate ? 72 : 28) + (plantHeightFt > 5 ? 18 : 0) + (largeFruit ? 8 : 0)),
        pruning_need: clamp((indeterminate ? 62 : 28) + (disease < 50 ? 8 : 0)),
        spacing_need: clamp(plantHeightFt ? plantHeightFt * 12 : indeterminate ? 70 : 44),
        harvest_window_score: clamp(early * 0.45 + late * 0.45 + (determinate ? 4 : 10)),
        transplant_forgiveness: clamp(42 + (hybrid ? 14 : 0) + (disease > 60 ? 16 : 0) + (determinate ? 8 : 0)),
        humidity_risk: clamp(72 - disease + (denseFoliageSignal(fields.leaf_type, plantType) ? 12 : 0)),
        split_risk: clamp(68 - (disease > 60 ? 8 : 0) - (hasAny(lower, ['crack resistant']) ? 24 : 0) + (juiciness > 60 ? 8 : 0)),
        blossom_end_rot_risk: clamp(44 + (largeFruit ? 16 : 0) + (paste ? 8 : 0) - (hybrid ? 6 : 0)),
        foliage_disease_risk: clamp(72 - disease + (plantType.includes('indeterminate') ? 6 : 0)),
        short_season_fit: clamp(early + (plantHeightFt && plantHeightFt <= 4 ? 8 : 0)),
        long_season_fit: clamp(late + (indeterminate ? 8 : 0)),
        commercial_fit: clamp(market.overall + (hybrid ? 14 : 0) + (shelfLifeScore(lower, paste) / 4)),
        home_garden_fit: clamp(48 + (heirloom ? 14 : 0) + (openPollinated ? 10 : 0) + (garden_easeScore(plantType, disease, hybrid) / 4)),
        color_contrast: clamp((bicolor ? 80 : 30) + (striped ? 18 : 0) + (dark ? 10 : 0)),
        plate_appeal: clamp(visualDrama * 0.65 + rawEatingScore(sweet, juiciness, acid) * 0.35),
        cultivar_confidence: clamp(50 + fieldCompleteness * 0.4 + (fields.comments ? 12 : 0)),
        source_traceability: clamp(44 + (variety.url ? 26 : 0) + (variety.page_title ? 12 : 0)),
        data_quality_score: clamp(fieldCompleteness * 0.55 + (variety.raw_text ? 24 : 0) + (fields.comments ? 10 : 0)),
        decision_readiness: clamp(fieldCompleteness * 0.45 + garden_easeScore(plantType, disease, hybrid) * 0.2 + market.overall * 0.2 + rawEatingScore(sweet, juiciness, acid) * 0.15)
    };
}

function commentSignal(value = '') {
    return compactText(value).replace(/[^a-z0-9]/gi, '').length > 20;
}

function rareNameSignal(value = '') {
    return hasAny(value, ['striped', 'zebra', 'black', 'purple', 'green', 'chocolate', 'pineapple', 'rainbow']);
}

function noveltySignal(value = '') {
    return hasAny(value, ['stripe', 'striped', 'zebra', 'black', 'purple', 'green', 'white', 'bi-color', 'bicolor', 'pear', 'heart']);
}

function garden_easeScore(plantType, disease, hybrid) {
    return clamp(42 + (plantType.includes('determinate') ? 18 : 0) + (disease > 60 ? 18 : 0) + (hybrid ? 8 : 0));
}

function fineDiningScore(visualDrama, umami, heirloom) {
    return clamp((visualDrama > 65 ? 30 : 0) + (umami > 68 ? 14 : 0) + (heirloom ? 12 : 0));
}

function canningScore(paste, density, acid) {
    return clamp(36 + (paste ? 34 : 0) + (density > 65 ? 14 : 0) + (acid > 60 ? 12 : 0));
}

function shelfLifeScore(lower, paste) {
    return clamp(40 + (hasAny(lower, ['commercial', 'firm', 'storage', 'shipping']) ? 26 : 0) + (paste ? 10 : 0));
}

function denseFoliageSignal(leafType, plantType) {
    return hasAny(`${leafType} ${plantType}`, ['potato', 'indeterminate', 'regular']);
}

function rawEatingScore(sweet, juiciness, acid) {
    return clamp(40 + (sweet > 72 ? 18 : 0) + (juiciness > 52 ? 14 : 0) + (acid < 70 ? 8 : 0));
}

function slicingScoreBonus(shape, sizeOz) {
    let bonus = 0;
    if (shape.includes('round') || shape.includes('flattened')) bonus += 12;
    if (sizeOz && sizeOz >= 6) bonus += 12;
    return bonus;
}

function deriveMarketAvailability(fields, context) {
    const availability = compactText(fields.availability || '').toLowerCase();
    const origin = compactText(fields.origin || '').toLowerCase();
    const usage = compactText(fields.usage || '').toLowerCase();
    const type = context.type || '';
    const breed = context.breed || '';

    let base = 30;
    if (availability.includes('commercial')) base += 28;
    if (availability.includes('seed exchange')) base -= 8;
    if (type.includes('commercial')) base += 24;
    if (type.includes('garden')) base += 10;
    if (type.includes('heirloom')) base -= 10;
    if (type.includes('specialty')) base -= 6;
    if (breed.includes('hybrid')) base += 10;
    if (context.cherry || context.beefsteak || context.paste) base += 8;
    if (usage.includes('fresh')) base += 5;
    if (context.disease > 60) base += 8;

    const northeast = base
        + (origin.includes('usa') || origin.includes('new jersey') || origin.includes('pennsylvania') ? 10 : 0)
        + (context.earlySeason ? 8 : 0)
        + (context.lateSeason ? -6 : 0)
        + (context.disease > 60 ? 8 : 0);

    const humid = base
        + (context.disease > 60 ? 14 : -6)
        + (availability.includes('commercial') ? 6 : 0);

    const hot = base
        + (origin.includes('texas') || origin.includes('florida') || origin.includes('mexico') ? 14 : 0)
        + (context.lateSeason ? 5 : 0)
        + (context.earlySeason ? -4 : 0);

    const cool = base
        + (context.earlySeason ? 14 : -4)
        + (origin.includes('russia') || origin.includes('canada') || origin.includes('siberia') ? 12 : 0);

    const container = base
        + (context.plantType.includes('determinate') ? 14 : -5)
        + (context.cherry ? 8 : 0);

    return {
        overall: clamp(base),
        northeast: clamp(northeast),
        humid: clamp(humid),
        hot: clamp(hot),
        cool: clamp(cool),
        container: clamp(container)
    };
}

function enhanceVariety(variety, index) {
    const fields = parseVarietyFields(variety);
    const colors = colorProfile(fields.skin_color, fields.flesh_color);
    const attributes = deriveAttributes(fields, variety, index);
    const image = Array.isArray(variety.images) && variety.images.length ? variety.images[0] : null;
    const wikimediaImage = getWikimediaImage(variety.name);
    const sourceImageUrl = image && !/njaes\.rutgers\.edu\/tomato-varieties\/images\//i.test(image.url) ? image.url : '';
    const imageUrl = wikimediaImage?.thumb_url || sourceImageUrl || '';
    const comment = stripBoilerplate(fields.comments || '');

    return {
        id: variety.slug || variety.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: variety.name,
        slug: variety.slug || '',
        url: variety.url || '',
        imageUrl,
        imageAlt: wikimediaImage ? wikimediaImage.title.replace(/^File:/, '') : image ? image.alt : '',
        imageSource: wikimediaImage ? `Wikimedia Commons${wikimediaImage.license ? ` / ${wikimediaImage.license}` : ''}` : imageUrl ? 'Source image' : 'Wikimedia image pending',
        imageCredit: wikimediaImage?.artist || wikimediaImage?.credit || '',
        description: comment || buildVarietySummary(fields),
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
        const attributeCounts = toyVarieties.map(variety => Object.keys(variety.attributes || {}).length);
        const attributeCount = attributeCounts.length ? Math.min(...attributeCounts) : 0;
        
        res.render('index', { 
            varieties: rawVarieties,
            toyVarieties,
            totalCount: data.total_count || 0,
            scrapedAt: data.scraped_at || '',
            source: data.source || '',
            toyStats: {
                imageCount,
                attributeCount,
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

if (require.main === module) {
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
}

module.exports = {
    app,
    enhanceVariety,
    parseVarietyFields,
    deriveAttributes
};
