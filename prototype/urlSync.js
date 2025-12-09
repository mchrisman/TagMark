
// Import global type definitions
import "../../types.js";
/**
 * URL Synchronization Component
 * 
 * Provides bidirectional sync between ActDown state and URL hash parameters.
 * Uses presence-based whitelisting for state→URL sync, and unrestricted URL→state sync.
 * 
 * Usage:
 *   <url include={['myModal', 'selectedPlayer']} includeTransient={['scroll']}>
 *     {$urlState.myModal && <Modal />}
 *     {$urlState.selectedPlayer && <PlayerView />}
 *   </url>
 * 
 * Key Design Principles:
 * 1. DOM presence determines what syncs (no lifecycle management needed)
 * 2. One global urlState namespace for all URL data
 * 3. Async state→URL sync with de-echoing
 * 4. Components read urlState directly (no prop injection)
 * 
 * Extended API:
 *  - includeTransient: keys to keep in the URL but use replaceState
 * 
 * // To do, we're using the global state, but we want to use a URL state namespace just for separation.
 */

let isUpdatingFromUrl = false;
let syncTimeout = null;
const SYNC_DEBOUNCE_MS = 5;
    // Initialize global URL state
    ActDown.set({ urlState: {} });

    // Track last persistent hash for push-vs-replace
    let lastPersistentHash = '';

    // Parse URL parameters into flat object
    function parseUrlToState() {
        const hash = window.location.hash.slice(1);
        if (!hash) return {};
        
        try {
            // Split on '#' to handle both segments
            const segments = hash.split('#');
            const combinedState = {};
            
            for (const segment of segments) {
                if (!segment) continue;
                
                // Check for JSON format before expensive decoding
                if (segment.startsWith('{') || segment.startsWith('%7B')) {
                    try {
                        const decoded = decodeURIComponent(segment);
                        Object.assign(combinedState, JSON.parse(decoded));
                        continue; // Successfully parsed as JSON, move to next segment
                    } catch {
                        // JSON parsing failed, fall through to URLSearchParams
                    }
                }
                
                // Parse as URLSearchParams
                const params = new URLSearchParams(segment);
                for (const [key, value] of params.entries()) {
                    try {
                        combinedState[key] = JSON.parse(value);
                    } catch {
                        combinedState[key] = value === 'true' ? true : value === 'false' ? false : value;
                    }
                }
            }
            
            return combinedState;
        } catch (error) {
            console.warn('Failed to parse URL hash:', hash, error);
            return {};
        }
    }
    
    // Sync URL → State (unrestricted)
    function syncUrlToState() {
        if (isUpdatingFromUrl) return;
        
        isUpdatingFromUrl = true;
        const urlParams = parseUrlToState();
        
        // Replace urlState completely with URL params (don't merge to avoid stale values)
        // This ensures that when URL parameters are removed, they're also removed from state
        ActDown.set({ 
            urlState: urlParams
        });
        
        setTimeout(() => {
            isUpdatingFromUrl = false;
        }, SYNC_DEBOUNCE_MS);
    }
    
    // Collect currently whitelisted keys from DOM
    function getActiveIncludes() {
        const includeSet = new Set();
        document.querySelectorAll('[data-url-include]').forEach(element => {
            try {
                const includes = JSON.parse(element.getAttribute('data-url-include'));
                includes.forEach(key => includeSet.add(key));
            } catch (error) {
                console.warn('Invalid data-url-include attribute:', element, error);
            }
        });
        return includeSet;
    }

    // Collect currently transient keys from DOM
    function getActiveTransient() {
        const transientSet = new Set();
        document.querySelectorAll('[data-url-includeTransient]').forEach(element => {
            try {
                const includes = JSON.parse(element.getAttribute('data-url-includeTransient'));
                includes.forEach(key => transientSet.add(key));
            } catch (error) {
                console.warn('Invalid data-url-includeTransient attribute:', element, error);
            }
        });
        return transientSet;
    }

    // Sync State → URL (persistent vs. transient)
    function syncStateToUrl() {
        if (isUpdatingFromUrl) return;

        clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            const persistentKeys = getActiveIncludes();
            const transientKeys = getActiveTransient();
            const urlState = ActDown.state.urlState;

            // Build filtered maps
            const persistent = {};
            const transient = {};
            for (const key of persistentKeys) {
                const val = urlState[key];
                if (val != null) persistent[key] = val;
            }
            for (const key of transientKeys) {
                const val = urlState[key];
                if (val != null) transient[key] = val;
            }

            // Serialize them - choose format based on complexity
            function serializeSegment(obj) {
                if (Object.keys(obj).length === 0) return '';
                
                const hasComplexValues = Object.values(obj).some(v => 
                    typeof v === 'object' || Array.isArray(v)
                );
                
                if (hasComplexValues) {
                    // Use JSON format for complex data - sort keys for stability
                    const sortedObj = {};
                    Object.keys(obj).sort().forEach(key => {
                        sortedObj[key] = obj[key];
                    });
                    return encodeURIComponent(JSON.stringify(sortedObj));
                } else {
                    // Use URLSearchParams for simple data - sort keys for stability
                    const params = new URLSearchParams();
                    Object.keys(obj).sort().forEach(key => {
                        params.set(key, String(obj[key]));
                    });
                    return params.toString();
                }
            }
            
            const pHash = serializeSegment(persistent);
            const tHash = serializeSegment(transient);

            // Combine fragments with a second “#”
            const fragments = [];
            if (pHash) fragments.push(pHash);
            if (tHash) fragments.push(tHash);
            const hashBody = fragments.join('#');
            const newUrl = hashBody ? `#${hashBody}` : '#';

            // Only update URL if it actually changed
            if (window.location.hash !== newUrl) {
                // Push if persistent changed, else replace
                const didPersistChange = pHash !== lastPersistentHash;
                lastPersistentHash = pHash;

                isUpdatingFromUrl = true;
                if (didPersistChange) {
                    window.history.pushState(null, '', newUrl);
                } else {
                    window.history.replaceState(null, '', newUrl);
                }
                setTimeout(() => {
                    isUpdatingFromUrl = false;
                }, SYNC_DEBOUNCE_MS);
            }
        }, SYNC_DEBOUNCE_MS);
    }

    // Set up bidirectional sync
    function initSync() {
        // Initialize lastPersistentHash from current URL
        const currentHash = window.location.hash.slice(1);
        const persistentSegment = currentHash.split('#')[0];
        lastPersistentHash = persistentSegment;
        
        // Initial URL → State sync
        syncUrlToState();
        
        // Listen for hash changes (back/forward buttons, external URL changes)
        window.addEventListener('hashchange', syncUrlToState);
        
        // Listen for urlState changes
        ActDown.subscribe(syncStateToUrl, 'urlState');
        
        // Also sync when DOM changes (to detect new/removed <url> components)
        // Use a MutationObserver to detect DOM changes
        const observer = new MutationObserver(syncStateToUrl);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-url-include', 'data-url-includeTransient']
        });
    }
    
    // URL Component Definition
    ActDown.def('url', ({ props, children }) => {
        const { include = [], includeTransient=[] } = props;
        
        if (!Array.isArray(include) || !Array.isArray(includeTransient)) {
            console.warn('url component "include" and "includeTransient" prop must be an array');
            return children;
        }
        
        // Create wrapper div with data attribute for DOM detection
        return ActDown.v('div', {
            'data-url-include': JSON.stringify(include),
            'data-url-includeTransient': JSON.stringify(includeTransient),
            style: 'display:contents' // CSS: display as if the wrapper doesn't exist
        }, ...children);
    });
    
    // Initialize sync system
    initSync();
    
    // Expose utilities for debugging
    window.urlSync = {
        getActiveIncludes,
        getActiveTransient,
        syncUrlToState,
        syncStateToUrl,
        parseUrlToState
    };