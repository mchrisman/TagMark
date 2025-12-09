/*
lightweight, constrained, straightforward, adequate, LLM-friendly reactive engine.
## Define a simple component
ActDown.def("Greeting", ({props}) => { return ActDown.v("div", {class: "welcome"}, "Hello, ", props.name, "!" ); });
## Mount it to the page
ActDown.mount(() => ActDown.v("Greeting", {name: "World"}), "#app" );
## Component with local state - explicit namespacing usually based on 'id'
ActDown.def("Counter", ({props}) => {
	const $local = ActDown.stateForId(props.id, () => ({ count: props.initialValue || 0 }));
	return ActDown.v("div", {},
		ActDown.v("p", {}, `${props.name}: `, $local.count),
		ActDown.v("button", {
			onClick: () => $local.count++  // Direct reactive assignment
		}, "Increment")
	);
});

Global state namespace is "", these are equivalent, both expose deep proxies that automatically schedule batch updates 
ActDown.stateForId("").name='Sue'
ActDown.state.name='Sue'

## Wrapper component
ActDown.def("LeftRight", ({props, children}) => {
	return ActDown.v("div", {class: "left-right"},
		ActDown.v("div", {class: "left"}, children[0]),  
		ActDown.v("div", {class: "right"}, children[1])
	);
});
ActDown.v("LeftRight",{},
	ActDown.v("em","I'm on the left"),
	"I'm on the right");
## More
- Fragments represented as simple arrays 
- Managed forms require the "ActDown-ext-forms.js" extension.
- Other extensions: ActDown-ext-backward-compat.js, ActDown-est-jsx.ts
- This file is small enough for you to read it whole if you need more details. 
*/

;(function (root, factory) {
	// Check if already loaded
	if (root.ActDown && root.ActDown.__loaded) {
		return;
	}

	if (typeof define === 'function' && define.amd) define([], factory);
	else if (typeof module === 'object' && module.exports) module.exports = factory();
	else root.ActDown = factory();
}(typeof self !== 'undefined' ? self : this, function () {

	const ActDown = (() => {

		// NOTE: avoid binding to DeepProxy's globals here; select per instance.
		// const {makeProxy: makeProxy, eventBus} = DeepProxy;

		class Impl {
			// DP can be either DeepProxy (shared bus) or DeepProxy.createIsolated()
			constructor(DP) {
				const d = DP || DeepProxy; // default to legacy shared bus
				this.makeProxy = d.makeProxy;
				this.eventBus = d.eventBus;
				// Track whether this instance OWNS its event bus (isolated) vs shares the global one.
				// When create() uses DeepProxy.createIsolated(), 'd' is a distinct object from the
				// module-level DeepProxy; otherwise it's the shared singleton.
				this.ownsEventBus = (typeof DeepProxy !== "undefined") ? (d !== DeepProxy) : true;

				// Track destroyed state
				this.destroyed = false;

				// Component registry
				this.comps = new Map();
				this.refreshFns = [];

				// Reactive state 
				this.subs = new Map();
				this.dataMap = new Map();
				this.proxies = new Map();
				this.pending = false;
				this.needsRefresh = false;
				this.rootState = this.state("");

				this.NS = {
					svg: 'http://www.w3.org/2000/svg',
					math: 'http://www.w3.org/1998/Math/MathML'
				};
				this.BOOL = new Set([
					'disabled', 'readonly', 'multiple',
					'required', 'autofocus'
				]);
				this.FORM_ELEMENTS = new Set(['input', 'textarea', 'select']);
				this.USER_DATA_PROPS = new Set(['value', 'checked']);
			}

			flat(children) {
				return [children].flat(Infinity).filter(x => x != null && x !== false && x !== true);
			}

			// Handle anonymous component functions
			vAnon(fn, ...args) {
				let props = {}, children = [];
				if (args.length > 0 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
					props = args[0];
					children = args.slice(1);
				} else {
					children = args;
				}
				if (typeof fn === 'function') {
					return {tag: fn, props, children};
				}
				throw new Error('not a function', fn)
			}

			// v(componentName|tagName, props?, children|...children)
			v(tag, ...args) {
				let props = {}, children = [];
				if (args.length > 0 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
					props = args[0];
					children = args.slice(1);
				} else {
					children = args;
				}
				// Handle anonymous component functions
				if (typeof tag === 'function') {
					throw new Error("use vAnon for anon functions")
				}

				if (typeof tag !== 'string') {
					throw new TypeError('v(string|function,...)');
				}

				let ns = null;
				const [prefix, name] = tag.split(':', 2);
				if (name && this.NS[prefix]) {
					tag = name;
					ns = this.NS[prefix];
				}

				return {tag, props, children, ns};
			}

			error(e, name) {
				console.error(`Error in ${name}:`, e);
				return {
					tag: 'div',
					props: {class: 'actdown-error', style: "background-color: red"},
					children: [`Error in ${name}: ${e.message}`]
				};
			}

			// React to state change 
			notifyNamespace(ns) {
				if (this.destroyed) return; // No-op if destroyed
				if (ns === undefined || ns === null) return;
				const cbs = this.subs.get(ns);
				const proxy = this.proxies.get(ns);
				this.eventBus.emit({
					namespace: ns,
					state: proxy,
					timestamp: Date.now()
				});
				if (cbs) {
					cbs.forEach(cb => {
						try {
							cb(proxy);
						} catch (e) {
							console.error(e);
						}
					});
				}
				this.scheduleRefresh();
			}

			// Define component
			def(name, renderFn) {
				this.comps.set(name, renderFn);
				return name;
			}

			// Proxy for reactive state 
			state(namespace, initializer) {
				const ns = namespace == null ? "" : namespace;
				if (!this.proxies.has(ns)) {
					const data = {};
					this.dataMap.set(ns, data);
					this.proxies.set(ns, this.makeProxy(data, () => this.notifyNamespace(ns)));
				}
				const pxy = this.proxies.get(ns);
				if (initializer && !pxy.$initialized) {
					pxy.batch(() => {
						Object.assign(pxy, initializer());
						pxy.$initialized = true;
					});
				}
				return pxy;
			}

			// Deprecated; use state("")
			set(upd) {
				Object.assign(this.state(""), upd);
			}

			wipeAllState() {
				for (const [ns, data] of this.proxies.entries())
					data.__clear()
			}

			// subscribe(callback,namespace) 
			subscribe(callback, namespace = "") {
				if (!this.subs.has(namespace)) this.subs.set(namespace, new Set());
				const listeners = this.subs.get(namespace);
				listeners.add(callback);
				return () => listeners.delete(callback);
			}

			scheduleRefresh() {
				if (this.destroyed) return; // No-op if destroyed
				if (this.pending) {
					this.needsRefresh = true;
					return;
				}
				this.pending = true;
				Promise.resolve().then(() => {
					if (this.destroyed) { // Check again in async callback
						this.pending = false;
						return;
					}
					do {
						this.needsRefresh = false;
						this.refreshFns.forEach(fn => fn());
					} while (this.needsRefresh);
					this.pending = false;
				});
			}

			apply(props, ...children) {
				let passthrough = ({props: p, children: cs}) => {
					// one layer of flattening only
					return cs.reduce((a, b) => b instanceof Array ? [...a, ...b] : [...a, b], [])
					.map(b => (b instanceof Object && b.tag) ? this.v(b.tag, {...b.props, ...p}, b.children) : b);
				}
				return this.vAnon(passthrough,
					props, children);
			}

			/**
			 * If it's a function, evaluate with error boundaries, unshift children onto queue, return true
			 * Else return false
			 */
			_eval(vnode, queue) {
				let fn, tag;
				if (!vnode || !(tag = vnode.tag)) {
					return false
				}
				const {props = {}, children = []} = vnode;
				// named functional component
				if (typeof tag === 'string' && (fn = this.comps.get(tag)) && typeof fn === 'function') {
					tag = fn;
				}
				// anonymous functional component
				if (typeof tag === 'function') {
					try {
						const rv = tag({props, children});               // ##### Execute it! #####
						queue.unshift(...(Array.isArray(rv) ? rv : [rv]));
						return true
					} catch (e) {
						const errorVnode = this.error(e, tag.name || 'anonymous component');
						queue.unshift(errorVnode);
						return true
					}
				}
				return false;
			}

			prune(vnodes, shallow = false) {
				const queue = Array.isArray(vnodes) ? [...vnodes] : [vnodes];
				const out = [];
				while (queue.length) {
					const node = queue.shift();
					if (node == null || node === false || node === true)
						continue;
					if (Array.isArray(node) || (typeof node === 'object' && node.tag == null)) {
						const kids = Array.isArray(node) ? node : node.children || [];
						queue.unshift(...kids);
						continue;
					}
					if (typeof node !== 'object') { // leaf
						out.push(node);
						continue;
					}
					if (shallow && !this.comps.get(node.tag)) { // html tag
						out.push(node);
						continue;
					}
					const {tag, props = {}, children = [], ns} = node;
					let result = this._eval(node, queue)
					if (result)
						continue;
					let recurse = () => this.prune(children)
					if (tag && typeof tag === 'string') recurse = this.stackTraceDecorator(recurse, tag)
					const prunedKids = recurse();
					out.push({tag, props, ns, children: prunedKids});
				}
				return out;
			}

			// extension hook
			preRender(nodes) {
				return nodes
			}

			stackTraceDecorator(fn, name) {
				return {[name]: (...args) => fn(...args)}[name]
			}

			mount(component, element) {
				const container = typeof element === "string"
					? document.querySelector(element)
					: element;

				if (container.$ActDown$Unmount) container.$ActDown$Unmount();
				container.$ActDown$Unmount = null
				container.innerHTML = "";
				let oldChildren = [];
				const refreshFn = () => {
					let vnode = component();
					let newChildren
					if (typeof vnode === "string" && this.comps.has(vnode)) {
						let cg = this.comps.get(vnode);
						let ch = cg({props: {id: ""}});
						newChildren = this.prune([ch])
					} else {
						newChildren = this.prune([vnode]);
					}
					newChildren = this.preRender(newChildren);
					this.updateChildren({children: oldChildren}, {children: newChildren}, container);
					oldChildren = newChildren;
				};
				this.refreshFns.push(refreshFn);
				this.scheduleRefresh();
				let unmount = () => {
					const idx = this.refreshFns.indexOf(refreshFn);
					if (idx > -1) this.refreshFns.splice(idx, 1);
					container.innerHTML = "";
					// (state left intact for potential reuse)
				};
				container.$ActDown$Unmount = unmount
				return unmount;
			}

			unmount(container) {
				if (container.$ActDown$Unmount) container.$ActDown$Unmount();
				container.$ActDown$Unmount = null
			}

			updateProps(el, oldP = {}, newP = {}, blacklist) {
				for (const k in oldP) {
					if (blacklist && blacklist.has(k)) continue;
					if (!(k in newP)) {
						if (k.startsWith('on')) {
							el.removeEventListener(k.slice(2).toLowerCase(), oldP[k]);
						} else if (this.BOOL.has(k)) {
							el[k] = false;
							el.removeAttribute(k);
						} else {
							el.removeAttribute(k);
						}
					}
				}

				for (const k in newP) {
					if (blacklist && blacklist.has(k)) continue;
					const v = newP[k];
					if (v !== oldP[k]) {
						if (k.startsWith('on')) {
							const ev = k.slice(2).toLowerCase();
							if (oldP[k]) el.removeEventListener(ev, oldP[k]);
							el.addEventListener(ev, v);
						} else if (this.USER_DATA_PROPS.has(k) && this.FORM_ELEMENTS.has(el.tagName.toLowerCase())) {
							// Skip all user data properties on form elements (extension will handle)
							continue;
						} else if ("selected" === k && "option" === el.tagName.toLowerCase()) {
							continue
						} else if (this.BOOL.has(k)) {
							// Always reflect both property and attribute
							const isTrue = !!v;
							el[k] = isTrue;
							if (isTrue) el.setAttribute(k, '');
							else el.removeAttribute(k);
						} else if ((k === 'className') && v != null) {
							el.setAttribute('class', v);
						} else if (k === 'style' && typeof v === 'object') {
							for (const [prop, val] of Object.entries(v)) {
								const name = prop.replace(/-([a-z])/g, (_, l) => l.toUpperCase()); // kebab → camel
								el.style[name] = val;
							}

							// remove stale style props present before but absent now
							const old = (oldP && typeof oldP.style === 'object') ? oldP.style : null;
							if (old) {
								for (const prop of Object.keys(old)) {
									if (!(prop in v)) {
										const name = prop.replace(/-([a-z])/g, (_, l) => l.toUpperCase());
										el.style[name] = '';
									}
								}
							}
						} else if (k.startsWith('$')) {
							continue;
						} else {
							try {
								el.setAttribute(k, v);
							} catch (e) {
								console.warn("ignoring", e);
							}
						}
					}
				}
			}

			updateElement(parent, newNode, oldNode, idx = 0) {
				if (newNode === null || oldNode === null) {
					throw Error("assertion failed");
				}
				try {
					const el = parent.childNodes[idx];
					if (!el) {
						console.log("handling dom mismatch (missing)")
						parent.appendChild(this.createElement(newNode));
						return;
					}
					if (typeof newNode !== "object") { // text node
						if (el.nodeType !== Node.TEXT_NODE || el.textContent !== newNode || oldNode !== newNode) {
							parent.replaceChild(document.createTextNode(newNode), el);
						}
						return;
					}
					if (typeof oldNode !== "object") {
						parent.replaceChild(this.createElement(newNode), el);
						return;
					}

					// Sufficient to support unmanaged forms. More extensive form handling
					// is in the add-on ActDown-ext-forms.js
					if (newNode.props.name === oldNode.props.name
						&& newNode.props.id === oldNode.props.id
						&& newNode.tag === oldNode.tag) {
						if (this.FORM_ELEMENTS.has(newNode.tag)) {
							this.updateProps(el, oldNode.props || {}, newNode.props || {});

							if (newNode.tag === 'select') {
								this.updateChildren(oldNode, newNode, el);
								return
							} else {

								return; // Prevent replacement
							}
						} else if ("option" === newNode.tag) {
							this.updateProps(el, oldNode.props || {}, newNode.props || {});
							this.updateChildren(oldNode, newNode, el);
							return;
						}
					}

					if (oldNode.tag === newNode.tag) {
						this.updateProps(el, oldNode.props || {}, newNode.props || {});
						this.updateChildren(oldNode, newNode, el);
						return;
					}

					parent.replaceChild(this.createElement(newNode), el);

				} catch (e) {
					console.error("Update error:", e, e.stack);
					while (parent.firstChild) parent.removeChild(parent.firstChild);
					parent.appendChild(this.createElement({
						tag: "div",
						props: {class: "actdown-error"},
						children: [`Update error: ${e.message}`]
					}));
				}
			}

			shallowEqual(tag, a, b) {
				if (a === b) return true;
				if (a == null || b == null ||
					typeof a !== "object" || typeof b !== "object") {
					return false;
				}
				const keysA = Object.keys(a), keysB = Object.keys(b);
				if (keysA.length !== keysB.length) return false;
				for (let key of keysA) {
					let av = a[key], bv = b[key];
					if (typeof av === 'function' && typeof bv === 'function')
						if (av.toString() === bv.toString())
							continue;
					if (av !== bv) return false;
				}
				return true;
			}

			changed(a, b) {
				if (typeof a !== typeof b) return true;
				if (a !== Object(a)) {
					return a !== b;
				}
				if (a.tag !== b.tag) return true;
				return !this.shallowEqual(a.tag, a.props, b.props);
			}

			createElement(vnode) {
				if (typeof vnode !== "object" || vnode == null) {
					return document.createTextNode(
						vnode == null ? "" : String(vnode)
					);
				}

				const ns = vnode.ns;
				const el = ns
					? document.createElementNS(ns, vnode.tag)
					: document.createElement(vnode.tag);
				this.updateProps(el, {}, vnode.props);
				(vnode.children || []).forEach(child => el.appendChild(this.createElement(child)));
				return el;
			}

			updateChildren(oldNode, newNode, parent) {
				// 1) Normalize old and new vnode lists
				const oldVnodes = Array.isArray(oldNode.children)
					? oldNode.children
					: oldNode.children == null
						? []
						: [oldNode.children];
				const newVnodes = Array.isArray(newNode.children)
					? newNode.children
					: newNode.children == null
						? []
						: [newNode.children];

				// 2) Build a map of keyed old nodes + queue of keyless old nodes
				const doms = Array.from(parent.childNodes);
				const keyMap = new Map();
				const keyless = [];
				doms.forEach((dom, i) => {
					const oldVnode = oldVnodes[i];
					const key = oldVnode?.props?.key;
					if (key != null) keyMap.set(key, {dom, oldVnode});
					else keyless.push({dom, oldVnode});
				});

				// 3) Reconcile in order
				for (let idx = 0; idx < newVnodes.length; idx++) {
					const vnode = newVnodes[idx];
					const key = vnode.props?.key;
					let dom, oldVnode;

					if (key != null && keyMap.has(key)) {
						({dom, oldVnode} = keyMap.get(key));
						keyMap.delete(key);
					} else if (key == null && keyless.length) {
						({dom, oldVnode} = keyless.shift());
					} else {
						let newChild = this.createElement(vnode);
						const ref = parent.childNodes[idx] || null;
						parent.insertBefore(newChild, ref);
						continue;
					}

					// Insert or move into the correct position
					const ref = parent.childNodes[idx] || null;
					if (dom !== ref) parent.insertBefore(dom, ref);

					// Patch it
					this.updateElement(parent, vnode, oldVnode, idx);
				}

				// 4) Remove any leftover keyed nodes
				keyMap.forEach(({dom}) => parent.removeChild(dom));

				// 5) Prune extra keyless tails
				const desired = newVnodes.length;
				while (parent.childNodes.length > desired) {
					parent.removeChild(parent.childNodes[desired]);
				}
			}

		}

		function buildAPI(impl) {
			function _flatten(children) {
				return [children].flat(99999).filter(c => c != null && c !== false);
			}
			function _shallowEvaluate(children) {
				if (children == null) return [];
				if (!(Array.isArray(children))) {
					children = [children];
				}
				const queue = [children].flat(99999).filter(c => c != null && c !== false);
				let result = impl.prune(queue, true);
				children.splice(0, Infinity, ...result)
				return [...children];
			}
			function _childrenOfSlots(children, ...tags) {
				if (children == null || children.length === 0) return [];
				if (tags == null || tags.length === 0) return children;
				let b = _shallowEvaluate(children).filter(c => c != null && c !== false && "tag" in c && typeof c.tag === "string" && !(c.tag in impl.comps) && c.tag === tags[0]);
				let result = []
				b.forEach(c => {
					let childs = c.children ?? [];
					let r = _childrenOfSlots(childs, ...(tags.slice(1)))
					result.push(r === null ? [] : [...r])
				})
				return result;
			}
			return {
				v: impl.v.bind(impl),
				vAnon: impl.vAnon.bind(impl),
				def: impl.def.bind(impl),
				state: impl.rootState,
				stateForId: impl.state.bind(impl),
				set: impl.set.bind(impl),
				wipeAllState: impl.wipeAllState.bind(impl),
				subscribe: impl.subscribe.bind(impl),
				mount: impl.mount.bind(impl),
				unmount: impl.unmount.bind(impl),
				scheduleRefresh: impl.scheduleRefresh.bind(impl),
				apply: impl.apply.bind(impl),
				preRender: impl.preRender.bind(impl),
				extend(fn) {
					fn(this);
					return this;
				},
				frag: (...args) => args,

				wrapperUtils: {
					flatten: _flatten,
					shallowEvaluate: _shallowEvaluate,
					childrenOfSlots: _childrenOfSlots
				},

				_internal: impl,

				get eventBus() {
					return impl.eventBus;
				},

				__loaded: true,
				
				// Clean up instance resources (idempotent)
				destroy() {
					if (impl.destroyed) return; // Already destroyed
					impl.destroyed = true;

					// Stop future updates. (Each container keeps its own $ActDown$Unmount.)
					// We don't attempt to call unmounts here because we don't own containers.
					impl.refreshFns = [];

					// Clear all state
					impl.wipeAllState();

					// Clear all subscriptions
					impl.subs.clear();

					// Clear component registry
					impl.comps.clear();

					// Clear proxies and data maps
					impl.proxies.clear();
					impl.dataMap.clear();

					// Only clear event bus listeners if this instance OWNS its bus (isolated).
					// Never clear listeners on the shared global bus.
					if (impl.ownsEventBus && impl.eventBus && impl.eventBus.listeners) {
						impl.eventBus.listeners.clear();
					}
				}
			};
		}

		// Default singleton uses the legacy shared DeepProxy bus (backward compatible)
		const impl = new Impl(DeepProxy);
		const api = buildAPI(impl);

		// Create additional instances:
		// - default: isolated bus (if available)
		// - options.sharedBus === true -> use shared DeepProxy.eventBus
		api.create = function (options) {
			const useShared = options && options.sharedBus === true;
			const DP = useShared
				? DeepProxy
				: (DeepProxy && typeof DeepProxy.createIsolated === "function"
					? DeepProxy.createIsolated()
					: DeepProxy);
			return buildAPI(new Impl(DP));
		};

		return api;

	})();

	return ActDown;

})); // End UMD
