/**
 * NoveltyTracker — familiarity-aware novelty detection.
 *
 * Maintains a registry of everything the AI has "experienced",
 * scored by encounter count (familiarity).  Replaces the simpler
 * binary seen/unseen model with a gradual familiarity scale so that
 * future systems (long-term memory, preferences, character cards)
 * can distinguish "first time" from "we come here often".
 *
 * P1 scope:
 *   - Track biomes, structures, entity types, and terrain features.
 *   - Produce novel_discovery Observations with familiarity labels.
 *   - Serialise to / deserialise from plain objects (memory.json).
 *   - registerCategory() extension point for mod / custom content.
 *
 * Does NOT call any LLM.  Does NOT query the world directly —
 * it consumes labels produced by VisionPerception via EventDetector.
 */

// ---------------------------------------------------------------------------
// Rarity keywords that boost significance
// ---------------------------------------------------------------------------
const RARE_BIOME_KEYWORDS = [
    'mushroom', 'jungle', 'cherry', 'pale',
    'badlands', 'mesa', 'bamboo', 'mangrove',
];
const RARE_ENTITY_KEYWORDS = [
    'panda', 'fox', 'axolotl', 'sniffer',
    'allay', 'warden', 'breeze', 'armadillo',
];
const HIGH_SIGNIFICANCE_STRUCTURES = [
    'dungeon', 'stronghold', 'ancient_city', 'trail_ruins',
    'trial_chambers', 'woodland_mansion', 'ocean_monument',
];

// ---------------------------------------------------------------------------
// Familiarity thresholds
// ---------------------------------------------------------------------------
const FAMILIARITY_LEVELS = {
    first_time:  { max: 0 },            // count === 0  (novel)
    unfamiliar:  { max: 2 },            // count 1-2
    familiar:    { max: 5 },            // count 3-5
    well_known:  { max: Infinity },     // count >5
};

function familiarityLabel(count) {
    if (count <= 0) return 'first_time';
    if (count <= 2) return 'unfamiliar';
    if (count <= 5) return 'familiar';
    return 'well_known';
}

// ---------------------------------------------------------------------------
// NoveltyTracker
// ---------------------------------------------------------------------------
export class NoveltyTracker {
    /**
     * @param {object} [state]  Previously serialised state (from memory.json).
     */
    constructor(state) {
        // familiarity: category → Map<targetName, encounterCount>
        this.familiarity = {};

        // Custom category matchers registered by mods / future code.
        // Map<categoryName, (visionLabels: string[]) => string[]>
        this._customMatchers = new Map();

        // Built-in categories
        this._initBuiltinCategories();

        // Hydrate from saved state
        if (state) this._deserialise(state);
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    /**
     * Register a custom category for novelty detection.
     * @param {string}   category   e.g. 'mod_biomes', 'custom_structures'
     * @param {function} matcher    (visionLabels: string[]) => string[]
     *   Should return an array of target names extracted from the labels.
     */
    registerCategory(category, matcher) {
        this._customMatchers.set(category, matcher);
        if (!this.familiarity[category])
            this.familiarity[category] = new Map();
    }

    /**
     * Check a set of VisionPerception labels for novel discoveries.
     * Increments encounter counts for everything seen.
     *
     * @param {string[]} labels  e.g. ["Morning", "Plains", "Big Tree", "Cow", "Village"]
     * @param {string}   biome   Current biome name (from world.getBiomeName)
     * @returns {object[]}  Array of novel_discovery observation-data objects.
     */
    checkNovelty(labels, biome) {
        const discoveries = [];

        // Biome (register the raw biome name as seen)
        if (biome) {
            const result = this._checkCategory('biomes', biome, labels);
            if (result) discoveries.push(result);
        }

        // Structures detected in labels
        const structureTargets = this._extractStructures(labels);
        for (const target of structureTargets) {
            const result = this._checkCategory('structures', target, labels);
            if (result) discoveries.push(result);
        }

        // Entity types in labels
        const entityTargets = this._extractEntities(labels);
        for (const target of entityTargets) {
            const result = this._checkCategory('entity_types', target, labels);
            if (result) discoveries.push(result);
        }

        // Terrain features in labels
        const terrainTargets = this._extractTerrain(labels);
        for (const target of terrainTargets) {
            const result = this._checkCategory('terrain_features', target, labels);
            if (result) discoveries.push(result);
        }

        // Run custom matchers
        for (const [category, matcher] of this._customMatchers) {
            const targets = matcher(labels);
            for (const target of targets) {
                const result = this._checkCategory(category, target, labels);
                if (result) discoveries.push(result);
            }
        }

        return discoveries;
    }

    /**
     * Peek at familiarity without incrementing.
     * @returns {number} encounter count (0 = never seen).
     */
    getFamiliarity(category, target) {
        const map = this.familiarity[category];
        if (!map) return 0;
        return map.get(this._normalise(target)) || 0;
    }

    /**
     * Manually record an encounter (for events that bypass label scanning,
     * e.g. cave_entered via skyLight change rather than a label).
     */
    recordEncounter(category, target) {
        const key = this._normalise(target);
        if (!this.familiarity[category])
            this.familiarity[category] = new Map();
        const map = this.familiarity[category];
        const prev = map.get(key) || 0;
        map.set(key, prev + 1);
    }

    // ------------------------------------------------------------------
    // Serialisation (for memory.json)
    // ------------------------------------------------------------------

    serialise() {
        const obj = {};
        for (const [cat, map] of Object.entries(this.familiarity)) {
            if (map.size > 0) {
                obj[cat] = Object.fromEntries(map);
            }
        }
        return obj;
    }

    _deserialise(state) {
        for (const [cat, mapObj] of Object.entries(state)) {
            if (!this.familiarity[cat])
                this.familiarity[cat] = new Map();
            for (const [key, count] of Object.entries(mapObj)) {
                this.familiarity[cat].set(key, count);
            }
        }
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    _initBuiltinCategories() {
        this.familiarity.biomes = new Map();
        this.familiarity.structures = new Map();
        this.familiarity.entity_types = new Map();
        this.familiarity.terrain_features = new Map();
    }

    _checkCategory(category, target, labels) {
        const key = this._normalise(target);
        if (!this.familiarity[category])
            this.familiarity[category] = new Map();
        const map = this.familiarity[category];
        const prevCount = map.get(key) || 0;

        // Increment
        map.set(key, prevCount + 1);

        // Only the VERY FIRST encounter produces a novel_discovery
        if (prevCount > 0) return null;

        const sig = this._calcSignificance(category, target, labels);
        return {
            target,
            category,
            significance: sig,
            familiarity: 'first_time',
            encounter_count: 1,
        };
    }

    _normalise(target) {
        return String(target).toLowerCase().replace(/\s+/g, '_');
    }

    // ---- Label extractors ----

    _extractStructures(labels) {
        const structureLabels = [
            'Village', 'Dungeon', 'Portal', 'Stronghold',
            'Ocean Monument', 'Woodland Mansion', 'Ancient City',
            'Trail Ruins', 'Desert Pyramid', 'Jungle Pyramid',
            'Swamp Hut', 'Igloo', 'Pillager Outpost', 'Nether Fortress',
            'Bastion', 'End City', 'Witch Hut',
        ];
        return labels.filter(l => structureLabels.includes(l));
    }

    _extractEntities(labels) {
        // Entity labels are diverse; anything not in the terrain/biome/time
        // categories is likely an entity.  Use a denylist approach.
        const denylist = new Set([
            // Time
            'Sunrise', 'Morning', 'Noon', 'Afternoon',
            'Sunset', 'Evening', 'Midnight', 'Night',
            // Weather
            'Rain', 'Thunderstorm',
            // Biome terrain
            'Plains', 'Forest', 'Mountain', 'Desert', 'Swamp', 'Snow',
            'Water', 'Lava', 'Mushroom', 'Nether', 'The End',
            // Block/terrain features
            'Big Tree', 'Underground', 'Cave', 'Village',
            'Dungeon', 'Portal', 'Stronghold',
        ]);
        return labels.filter(l => !denylist.has(l) && l.length > 0);
    }

    _extractTerrain(labels) {
        const terrainLabels = [
            'Underground', 'Big Tree', 'Water', 'Lava',
        ];
        return labels.filter(l => terrainLabels.includes(l));
    }

    // ---- Significance scoring ----

    _calcSignificance(category, target, labels) {
        const key = this._normalise(target);

        if (category === 'biomes') {
            const isRare = RARE_BIOME_KEYWORDS.some(kw => key.includes(kw));
            return Math.min(1.0, (isRare ? 0.5 + 0.3 : 0.5));
        }

        if (category === 'entity_types') {
            const isRare = RARE_ENTITY_KEYWORDS.some(kw => key.includes(kw));
            return Math.min(1.0, (isRare ? 0.4 + 0.3 : 0.4));
        }

        if (category === 'structures') {
            const isHigh = HIGH_SIGNIFICANCE_STRUCTURES.some(
                s => key.includes(this._normalise(s))
            );
            return Math.min(1.0, (isHigh ? 0.6 + 0.4 : 0.6));
        }

        // terrain_features and custom categories default
        return 0.5;
    }
}
