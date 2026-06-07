const fs = require('fs');
const path = require('path');
const { enhanceVariety } = require('../frontend/server');

const MIN_ATTRIBUTE_COUNT = 60;
const dataPath = path.join(__dirname, '..', 'backend', 'tomato_varieties.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const varieties = data.varieties || [];

const enhanced = varieties.map(enhanceVariety);
const counts = enhanced.map(variety => ({
    name: variety.name,
    attributeCount: Object.keys(variety.attributes || {}).length,
    fieldCount: Object.keys(variety.fields || {}).length
}));

const underMinimum = counts.filter(item => item.attributeCount < MIN_ATTRIBUTE_COUNT);
const min = counts.length ? Math.min(...counts.map(item => item.attributeCount)) : 0;
const max = counts.length ? Math.max(...counts.map(item => item.attributeCount)) : 0;

console.log(JSON.stringify({
    totalVarieties: varieties.length,
    minimumRequired: MIN_ATTRIBUTE_COUNT,
    minAttributeCount: min,
    maxAttributeCount: max,
    underMinimumCount: underMinimum.length,
    sampleUnderMinimum: underMinimum.slice(0, 20)
}, null, 2));

if (underMinimum.length > 0) {
    process.exit(1);
}
