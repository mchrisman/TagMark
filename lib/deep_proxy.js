/*
Basic deep proxy, claims to do what you expect.  
Supports publishing of mutation events, and `batch()` for grouping notifications
 
c.f. https://chatgpt.com/c/68451f33-332c-8010-aa11-f8467a199e4d
c.f. https://chatgpt.com/c/684525f3-93bc-8010-a18b-c154b9f38380
*/

(function (root, factory) {
	// Check if already loaded
	if (root.DeepProxy && root.DeepProxy.__loaded) {
		return;
	}

	if (typeof exports === 'object') module.exports = factory();
	else if (typeof define === 'function' && define.amd) define([], factory);
	else root.DeepProxy = factory();
}(typeof self !== 'undefined' ? self : this, function () {

	// Small helper to create an event bus (allows multiple isolated buses).
	function createEventBus() {
		return {
			listeners: new Map(),

			subscribe(pattern, callback) {
				if (!this.listeners.has(pattern)) {
					this.listeners.set(pattern, new Set());
				}
				this.listeners.get(pattern).add(callback);
				return () => this.listeners.get(pattern)?.delete(callback);
			},

			emit(event) {
				const patterns = ['*', event.namespace].filter(p => p != null);

				patterns.forEach(pattern => {
					const subscribers = this.listeners.get(pattern);
					(subscribers || []).forEach(callback => {
						try {
							callback(event);
						} catch (error) {
							console.error(`EventBus subscriber error for pattern "${pattern}":`, error, error.stack);
						}
					});
				});
			}
		};
	}

	// Legacy global event bus shared by all reactive proxies (default instance).
	const globalEventBus = createEventBus();

	// Factory to build a makeProxy wired to a specific event bus
	function makeMakeProxy(eventBus) {
		return function makeProxy(root, notify) {
			const proxyCache = new WeakMap();
			let batchDepth = 0;
			let pending = false;

			function isObject(x) {
				return x !== null && typeof x === 'object';
			}

			function batch(fn) {
				const outer = batchDepth === 0;
				batchDepth++;
				try {
					const result = fn();
					batchDepth--;
					if (outer && pending) {
						try {
							notify();
						} catch (notifyError) {
							console.error('Error in reactive notification callback:', notifyError, notifyError.stack);
						}
						pending = false;
					}
					return result;
				} catch (e) {
					batchDepth--;
					pending = false;
					console.error('Error in batch operation:', e);
					if (e.stack) {
						console.error('Stack trace:', e.stack);
					}
					throw e;
				}
			}

			function trigger() {
				if (batchDepth > 0) pending = true;
				else notify();
			}

			function wrap(target) {
				if (!isObject(target)) return target;
				if (proxyCache.has(target)) return proxyCache.get(target);

				const proxy = new Proxy(target, {
					get(obj, key, receiver) {

						function wrapIfObject(val) {
							const desc = Object.getOwnPropertyDescriptor(obj, key);
							const isImmutable = desc && !desc.configurable && !desc.writable;
							if (isImmutable) return val;

							return isObject(val) ? wrap(val) : val;
						}

						if (key === '__unwrap') return target;
						if (key === 'batch') return batch;
						if (key === '__isReactiveProxy') return true;
						if (key === '__eventBus') return eventBus;
						if (key === '__clear') {
							return () => batch(() => {
								Object.keys(obj).forEach(k => delete obj[k]);
							});
						}

						const useOriginalReceiver = obj instanceof Map || obj instanceof Set || obj instanceof WeakMap || obj instanceof WeakSet;
						const val = useOriginalReceiver ? Reflect.get(obj, key, obj) : Reflect.get(obj, key, receiver);

						if (typeof val === 'function') {
							return (...args) => {
								const result = val.apply(obj, args);
								if (obj instanceof Map && ['set', 'delete', 'clear'].includes(key)) {
									trigger();
								} else if (Array.isArray(obj) && [
									'push', 'pop', 'shift', 'unshift',
									'splice', 'sort', 'reverse', 'fill', 'copyWithin'
								].includes(key)) {
									trigger();
								}
								return wrapIfObject(result);
							};
						}
						return wrapIfObject(val);
					},
					set(obj, key, value, receiver) {
						const result = Reflect.set(obj, key, value, receiver);
						trigger();
						return result;
					},
					deleteProperty(obj, key) {
						const result = Reflect.deleteProperty(obj, key);
						trigger();
						return result;
					}
				});

				proxyCache.set(target, proxy);
				return proxy;
			}
			return wrap(root);
		}
	}

	// Default (legacy) API, still exporting a singleton makeProxy/eventBus
	const makeProxy = makeMakeProxy(globalEventBus);

	const api = {
		makeProxy,
		eventBus: globalEventBus,
		// New: create an isolated DeepProxy scope (own event bus & maker).
		createIsolated() {
			const eb = createEventBus();
			return {makeProxy: makeMakeProxy(eb), eventBus: eb, __loaded: true};
		},
		__loaded: true
	};

	return api;
}));
