import * as world from '../library/world.js';

/**
 * VisionPerception — lightweight semantic perception layer.
 * Runs periodically (throttled internally to ~1s), queries the bot's immediate
 * environment, and produces human-readable semantic labels like:
 *   "Sunrise", "Plains", "Big Tree", "Cow", "Village", "Water"
 *
 * This module is STRICTLY read-only on the agent and does NOT feed into
 * the LLM prompt chain or the agent decision system. Its output flows
 * directly to the web dashboard HUD via the existing state-update channel.
 */
export class VisionPerception {
    /**
     * @param {object} agent   The Agent instance (provides .bot, .name)
     * @param {object} [opts]
     * @param {number} [opts.tickInterval=1000]  Minimum ms between summarise() calls
     * @param {number} [opts.maxLabels=12]       Cap for the labels array
     * @param {number} [opts.scanDistance=16]    Block / entity scan radius
     */
    constructor(agent, opts = {}) {
        this.agent = agent;
        this.tickInterval = opts.tickInterval ?? 1000;
        this.maxLabels = opts.maxLabels ?? 12;
        this.scanDistance = opts.scanDistance ?? 16;

        this._lastTick = 0;
        this._latest = null;           // { labels, raw, timestamp }
    }

    // ------------------------------------------------------------------
    // Public API — called from agent.update() and full_state.js
    // ------------------------------------------------------------------

    /**
     * Tick entry point.  Internally throttled so that summarise() runs at
     * most once per `this.tickInterval` ms.
     * @param {number} delta  ms since previous agent.update()
     */
    async update(delta) {
        this._lastTick += delta;
        if (this._lastTick < this.tickInterval) return;
        this._lastTick = 0;

        try {
            this._latest = await this.summarise();
        } catch (err) {
            // Perception is best-effort — never crash the agent.
            console.warn('[VisionPerception] summarise error:', err.message);
        }
    }

    /**
     * Returns the last computed perception snapshot, or null.
     * Called by getFullState() → state-update → dashboard.
     * @returns {{ labels: string[], raw: object, timestamp: number } | null}
     */
    getLatest() {
        return this._latest;
    }

    // ------------------------------------------------------------------
    // Summariser
    // ------------------------------------------------------------------

    async summarise() {
        const bot = this.agent.bot;
        if (!bot || !bot.entity) return null;

        const labels = [];
        const raw = {};

        // ---- Time of day ----
        const tod = bot.time?.timeOfDay;
        raw.timeOfDay = tod;
        if (tod !== undefined) {
            if (tod < 1000)           labels.push('Sunrise');
            else if (tod < 6000)      labels.push('Morning');
            else if (tod === 6000)    labels.push('Noon');
            else if (tod < 12000)     labels.push('Afternoon');
            else if (tod < 13000)     labels.push('Sunset');
            else if (tod < 18000)     labels.push('Evening');
            else if (tod === 18000)   labels.push('Midnight');
            else                      labels.push('Night');
        }

        // ---- Weather ----
        const thunder = bot.thunderState > 0;
        const rain = bot.rainState > 0;
        raw.weather = thunder ? 'Thunderstorm' : (rain ? 'Rain' : 'Clear');
        if (thunder)      labels.push('Thunderstorm');
        else if (rain)    labels.push('Rain');

        // ---- Biome ----
        const biome = world.getBiomeName(bot);
        raw.biome = biome;
        const biomeLabel = this._biomeLabel(biome);
        if (biomeLabel) labels.push(biomeLabel);

        // ---- Position / underground ----
        const pos = world.getPosition(bot);
        raw.position = { x: Number(pos.x.toFixed(1)), y: Number(pos.y.toFixed(1)), z: Number(pos.z.toFixed(1)) };

        let skyLight = 15;
        try {
            const feetBlock = bot.blockAt(pos);
            if (feetBlock) skyLight = feetBlock.skyLight;
        } catch (_) { /* ignore */ }
        raw.skyLight = skyLight;

        const underground = skyLight === 0 && pos.y < 55;
        if (underground) labels.push('Underground');

        // ---- Nearby blocks (categories) ----
        const blockTypes = world.getNearbyBlockTypes(bot, this.scanDistance);
        raw.blockCategories = {};

        if (!underground) {
            const hasTree = blockTypes.some(b => b.includes('_log') || b.includes('_wood') || b.includes('_leaves'));
            if (hasTree) {
                raw.blockCategories.tree = true;
                labels.push('Big Tree');
            }

            const hasWater = blockTypes.some(b =>
                b === 'water' || b === 'flowing_water' || b === 'seagrass' ||
                b === 'kelp' || b === 'kelp_plant' || b === 'bubble_column');
            if (hasWater) {
                raw.blockCategories.water = true;
                labels.push('Water');
            }

            const hasLava = blockTypes.some(b =>
                b === 'lava' || b === 'flowing_lava' || b === 'magma_block');
            if (hasLava) {
                raw.blockCategories.lava = true;
                labels.push('Lava');
            }
        }

        // ---- Village detection ----
        if (!underground) {
            const villageBlocks = [
                'bell', 'brewing_stand', 'blast_furnace', 'smoker',
                'cartography_table', 'fletching_table', 'loom', 'grindstone',
                'smithing_table', 'cauldron', 'composter', 'lectern',
                'stonecutter', 'barrel', 'lantern'
            ];
            const hasVillageBlocks = villageBlocks.some(vb => blockTypes.includes(vb));
            const hasBeds = blockTypes.some(b => b.endsWith('_bed') || b === 'bed');
            const villageBlockCount = [hasVillageBlocks, hasBeds].filter(Boolean).length;
            raw.blockCategories.villageBlocks = villageBlockCount;
        }

        // ---- Nearby entities ----
        const entities = world.getNearbyEntities(bot, this.scanDistance);
        const entityTypes = [];
        const seenTypes = new Set();

        if (entities) {
            for (const ent of entities) {
                const name = (ent.name || '').toLowerCase();
                if (!name || name === 'player' || name === 'item') continue;
                if (seenTypes.has(name)) continue;
                seenTypes.add(name);
                entityTypes.push(name);

                const label = this._entityLabel(name);
                if (label) labels.push(label);
            }
        }
        raw.entityTypes = entityTypes;

        // ---- Village re-check via villagers ----
        if (!underground) {
            const hasVillagers = entityTypes.includes('villager');
            const hasIronGolem = entityTypes.includes('iron_golem');
            if ((hasVillagers || hasIronGolem || raw.blockCategories.villageBlocks >= 2) &&
                !labels.includes('Village')) {
                labels.push('Village');
            }
        }

        // ---- Deduplicate & cap ----
        const deduped = [...new Set(labels)];
        const capped = deduped.slice(0, this.maxLabels);

        return {
            labels: capped,
            raw,
            timestamp: Date.now()
        };
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * Map a Minecraft biome name to a short semantic label.
     */
    _biomeLabel(biome) {
        if (!biome) return null;
        const b = biome.toLowerCase();
        // Order matters: more-specific matches before generic ones.
        if (/mushroom/.test(b))                return 'Mushroom';
        if (/swamp|mangrove/.test(b))          return 'Swamp';
        if (/mountain|peak|slope|hill|cliff/.test(b)) return 'Mountain';
        if (/ocean|deep_ocean|river|beach/.test(b))  return 'Water';
        if (/snow|ice|frozen|tundra|taiga/.test(b))  return 'Snow';
        if (/desert|mesa|badlands/.test(b))     return 'Desert';
        if (/forest|wood|grove|jungle|savanna|birch|dark_forest/.test(b)) return 'Forest';
        if (/plains|meadow|field|sunflower/.test(b)) return 'Plains';
        if (/nether|crimson|warped|soul_sand|basalt/.test(b)) return 'Nether';
        if (/end|chorus/.test(b))              return 'The End';
        return null;
    }

    /**
     * Map an entity name to a human-readable label.
     * Returns null for entities we don't want to surface.
     */
    _entityLabel(name) {
        const map = {
            // Friendly / neutral animals
            chicken:    'Chicken',
            cow:        'Cow',
            pig:        'Pig',
            sheep:      'Sheep',
            rabbit:     'Rabbit',
            horse:      'Horse',
            donkey:     'Donkey',
            mule:       'Mule',
            llama:      'Llama',
            cat:        'Cat',
            wolf:       'Wolf',
            fox:        'Fox',
            mooshroom:  'Mooshroom',
            parrot:     'Parrot',
            ocelot:     'Ocelot',
            panda:      'Panda',
            polar_bear: 'Polar Bear',
            bee:        'Bee',
            goat:       'Goat',
            turtle:     'Turtle',
            frog:       'Frog',
            axolotl:    'Axolotl',
            camel:      'Camel',
            sniffer:    'Sniffer',
            armadillo:  'Armadillo',
            strider:    'Strider',
            dolphin:    'Dolphin',
            squid:      'Squid',
            glow_squid: 'Glow Squid',
            bat:        'Bat',
            salmon:     'Salmon',
            cod:        'Cod',
            tropical_fish: 'Tropical Fish',

            // Villagers & golems
            villager:           'Villager',
            wandering_trader:   'Wandering Trader',
            iron_golem:         'Iron Golem',
            snow_golem:         'Snow Golem',

            // Hostile mobs
            zombie:             'Zombie',
            skeleton:           'Skeleton',
            creeper:            'Creeper',
            spider:             'Spider',
            cave_spider:        'Cave Spider',
            enderman:           'Enderman',
            witch:              'Witch',
            phantom:            'Phantom',
            drowned:            'Drowned',
            husk:               'Husk',
            stray:              'Stray',
            slime:              'Slime',
            magma_cube:         'Magma Cube',
            blaze:              'Blaze',
            ghast:              'Ghast',
            piglin:             'Piglin',
            zombified_piglin:   'Zombified Piglin',
            hoglin:             'Hoglin',
            zoglin:             'Zoglin',
            wither_skeleton:    'Wither Skeleton',
            guardian:           'Guardian',
            elder_guardian:     'Elder Guardian',
            silverfish:         'Silverfish',
            endermite:          'Endermite',
            vindicator:         'Vindicator',
            pillager:           'Pillager',
            evoker:             'Evoker',
            ravager:            'Ravager',
            vex:                'Vex',
            shulker:            'Shulker',
            breeze:             'Breeze',
            bogged:             'Bogged',
            warden:             'Warden',

            // Misc
            allay:              'Allay',
        };

        if (map[name]) return map[name];

        // Fallback: capitalise and replace underscores
        if (name && name.length > 1 && !name.startsWith('area_effect')) {
            return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        return null;
    }
}
