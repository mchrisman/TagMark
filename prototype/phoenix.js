/**
 * Phoenix - Persistent State WebComponent Base Class
 *
 * A base class for creating WebComponents that maintain their state across
 * DOM lifecycle events, framework re-renders, and component recreation.
 *
 * Named "Phoenix" because components rise from the ashes of their previous
 * incarnation, retaining their state even when destroyed and recreated.
 *
 * @example
 * ```javascript
 * class MyCounter extends Phoenix {
 *   onConnect() {
 *     this.state.count ||= 0;
 *     this.render();
 *     this.addEventListener('click', () => {
 *       this.state.count++;
 *       this.render();
 *     });
 *   }
 *
 *   render() {
 *     this.innerHTML = `<button>Count: ${this.state.count}</button>`;
 *   }
 * }
 *
 * customElements.define('my-counter', MyCounter);
 * ```
 *
 * @author Your Name
 * @version 1.0.0
 */

/**
 * Global state store for all Phoenix component instances.
 * Keys are computed based on component hierarchy and attributes.
 * @type {Object<string, Object>}
 */
const PHOENIX_STORE = {};

/**
 * Phoenix Base Class
 *
 * Extends HTMLElement to provide persistent state management across component
 * lifecycle events. State is automatically persisted using a hierarchical key
 * system that survives component destruction and recreation.
 *
 * ## Key Features:
 * - **Automatic State Persistence**: State survives component destruction/recreation
 * - **Hierarchical Keys**: Parent-child relationships create logical key namespaces
 * - **Mutation Observing**: Automatically handles DOM changes and size changes
 * - **Error Boundaries**: Built-in error handling for lifecycle hooks
 * - **Performance Optimized**: Uses requestAnimationFrame for efficient updates
 *
 * ## Lifecycle Hooks:
 * - `onConnect()`: Called when component is attached to DOM
 * - `invoke()`: Called on mutations, resize, or scheduled updates (inside RAF)
 * - `onDisconnect()`: Called when component is removed from DOM
 * - `onError(err, hook)`: Called when any lifecycle hook throws an error
 *
 * ## State Management:
 * - Access state via `this.state` (getter-only property)
 * - State is automatically initialized as empty object `{}`
 * - State persists across component recreation using computed keys
 * - State changes should trigger `this._schedule()` for updates
 *
 * ## Key Generation Strategy:
 * 1. If component has `id` attribute: use the ID
 * 2. If component has `key` attribute: use `parentKey::key`
 * 3. If component has `data-key` attribute: use `parentKey::data-key`
 * 4. If component is only child: use `parentKey::0`
 * 5. Fallback: use `localName-${crypto.randomUUID()}`
 */
class Phoenix extends HTMLElement {
	/**
	 * Create a new Phoenix component instance.
	 * Sets up the state getter and initializes scheduling flags.
	 */
	constructor() {
		super();

		// Expose state as read-only property
		Object.defineProperty(this, 'state', {
			get: () => this._state,
			enumerable: false,
		});

		this._scheduled = false;
	}

	/**
	 * Called when the component is connected to the DOM.
	 * Initializes state, sets up observers, and calls user-defined onConnect hook.
	 *
	 * @private
	 */
	connectedCallback() {
		// Initialize key and state
		this._key = this._computeKey();
		this._state = PHOENIX_STORE[this._key] ||= {};

		// Set up DOM observers
		this._mo = new MutationObserver(this._onMutations.bind(this));
		this._ro = new ResizeObserver(() => this._schedule());

		// Observe DOM changes that might affect key computation
		this._mo.observe(this, {
			childList: true,
			attributes: true,
			attributeFilter: ['id', 'key', 'data-key'],
		});
		this._ro.observe(this);

		// Call user-defined connection hook with error protection
		try {
			this.onConnect?.();
		} catch (err) {
			this._handleError(err, 'onConnect');
		}

		// Schedule initial update
		this._schedule();
	}

	/**
	 * Called when the component is disconnected from the DOM.
	 * Cleans up observers and calls user-defined onDisconnect hook.
	 *
	 * @private
	 */
	disconnectedCallback() {
		// Clean up observers
		this._mo.disconnect();
		this._ro.disconnect();

		// Call user-defined disconnection hook with error protection
		try {
			this.onDisconnect?.();
		} catch (err) {
			this._handleError(err, 'onDisconnect');
		}
	}

	/**
	 * Compute a unique key for this component instance.
	 * Uses hierarchical naming to create logical namespaces.
	 *
	 * Key generation priority:
	 * 1. id attribute (highest priority)
	 * 2. key attribute with parent context
	 * 3. data-key attribute with parent context
	 * 4. positional key if only child
	 * 5. random UUID (fallback)
	 *
	 * @returns {string} Unique key for state storage
	 * @private
	 */
	_computeKey() {
		// Use explicit ID if available
		if (this.id) return this.id;

		const parent = this.parentNode;
		if (parent instanceof HTMLElement) { // todo this is wrong
			// Get parent's key context
			const parentKey = parent._computeKey?.() || '';

			// Use explicit key attributes
			if (this.hasAttribute('key')) {
				return `${parentKey}::${this.getAttribute('key')}`;
			}
			if (this.hasAttribute('data-key')) {
				return `${parentKey}::${this.getAttribute('data-key')}`;
			}

			// Use positional key if only child
			const siblings = parent.children;
			if (siblings.length === 1) {
				return `${parentKey}::0`;
			}
		}

		// Fallback to unique identifier
		return `${this.localName}-${crypto.randomUUID()}`;
	}

	/**
	 * Handle DOM mutations that might affect component state or key.
	 * Recomputes key and state reference when necessary.
	 *
	 * @param {MutationRecord[]} mutations - Array of mutation records
	 * @private
	 */
	_onMutations(mutations) {
		for (const mutation of mutations) {
			// Check for relevant changes
			if (mutation.type === 'childList' ||
				(mutation.type === 'attributes' &&
					(mutation.target === this || mutation.target.parentNode === this))
			) {
				// Recompute key and state reference
				this._key = this._computeKey();
				this._state = PHOENIX_STORE[this._key] ||= {};
				this._scheduled = false;
				this._schedule();
				break;
			}
		}
	}

	/**
	 * Schedule an update to be executed in the next animation frame.
	 * Prevents duplicate scheduling for performance optimization.
	 *
	 * @protected
	 */
	_schedule() {
		if (this._scheduled) return;
		this._scheduled = true;

		requestAnimationFrame(() => {
			this._scheduled = false;

			// Call user-defined invoke hook with error protection
			try {
				this.invoke?.();
			} catch (err) {
				this._handleError(err, 'invoke');
			}
		});
	}

	/**
	 * Handle errors that occur in lifecycle hooks.
	 * Calls user-defined error handler if available, otherwise logs to console.
	 *
	 * @param {Error} err - The error that occurred
	 * @param {string} hook - Name of the hook where error occurred
	 * @private
	 */
	_handleError(err, hook) {
		if (typeof this.onError === 'function') {
			try {
				this.onError(err, hook);
			} catch (e) {
				console.error(`[Phoenix] error in onError:`, e);
			}
		} else {
			console.error(`[Phoenix] error in ${hook}:`, err);
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// LIFECYCLE HOOKS - Override these in your subclass
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Called once when the component is connected to the DOM.
	 * Use this to initialize state, set up event listeners, and perform initial rendering.
	 *
	 * @example
	 * ```javascript
	 * onConnect() {
	 *   this.state.count ||= 0;
	 *   this.state.items ||= [];
	 *   this.render();
	 *   this.addEventListener('click', this.handleClick.bind(this));
	 * }
	 * ```
	 */
	onConnect() {
		// Override in subclass
	}

	/**
	 * Called inside requestAnimationFrame when:
	 * - DOM mutations occur (child changes, attribute changes)
	 * - Component is resized
	 * - _schedule() is manually called
	 *
	 * Use this for efficient updates, animations, or recalculations.
	 *
	 * @example
	 * ```javascript
	 * invoke() {
	 *   this.updateLayout();
	 *   this.recalculatePositions();
	 * }
	 * ```
	 */
	invoke() {
		// Override in subclass
	}

	/**
	 * Called once when the component is disconnected from the DOM.
	 * Use this to clean up event listeners, timers, or other resources.
	 *
	 * @example
	 * ```javascript
	 * onDisconnect() {
	 *   clearInterval(this.timer);
	 *   this.websocket?.close();
	 * }
	 * ```
	 */
	onDisconnect() {
		// Override in subclass
	}

	/**
	 * Called when any lifecycle hook throws an error.
	 * Use this for custom error handling, logging, or recovery strategies.
	 *
	 * @param {Error} err - The error that occurred
	 * @param {string} hook - Name of the hook where error occurred ('onConnect', 'invoke', 'onDisconnect')
	 *
	 * @example
	 * ```javascript
	 * onError(err, hook) {
	 *   console.warn(`Error in ${hook}:`, err);
	 *   if (hook === 'invoke') {
	 *     // Reset to safe state
	 *     this.state.position = { x: 0, y: 0 };
	 *     this.render();
	 *   }
	 * }
	 * ```
	 */
	onError(err, hook) {
		// Override in subclass for custom error handling
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a snapshot of all stored state for debugging.
 *
 * @returns {Object<string, Object>} Copy of all state entries
 * @example
 * ```javascript
 * console.log('All Phoenix state:', Phoenix.getAllState());
 * ```
 */
Phoenix.getAllState = function () {
	return Object.fromEntries(
		Object.entries(PHOENIX_STORE).map(([key, value]) => [key, structuredClone(value)])
	);
};

/**
 * Clear all stored state (useful for testing or reset functionality).
 *
 * @example
 * ```javascript
 * Phoenix.clearAllState();
 * ```
 */
Phoenix.clearAllState = function () {
	Object.keys(PHOENIX_STORE).forEach(key => delete PHOENIX_STORE[key]);
};

/**
 * Get list of all active state keys.
 *
 * @returns {string[]} Array of all state keys
 * @example
 * ```javascript
 * console.log('Active components:', Phoenix.getActiveKeys());
 * ```
 */
Phoenix.getActiveKeys = function () {
	return Object.keys(PHOENIX_STORE);
};