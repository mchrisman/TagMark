// ============================================
// TagMark Runtime
// ============================================

(function(global) {
    'use strict';

    // ---- Tracing ----
    // Categories: render, scope, eval
    // Usage: TagMarkDebug.enableTrace('render') or localStorage.setItem('tagmark:trace', 'render,scope')

    const TRACE_CATEGORIES = new Set();

    function traceEnabled(category) {
        return TRACE_CATEGORIES.has(category) || TRACE_CATEGORIES.has('*');
    }

    function trace(category, fn) {
        if (!traceEnabled(category)) return;
        const result = fn();
        const prefix = `[TagMark:${category}]`;
        if (Array.isArray(result)) {
            const [msg, data] = result;
            console.log(prefix, msg, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
        } else {
            console.log(prefix, result);
        }
    }

    function enableTrace(...categories) {
        categories.forEach(c => TRACE_CATEGORIES.add(c));
    }

    function disableTrace(...categories) {
        if (categories.length === 0) {
            TRACE_CATEGORIES.clear();
        } else {
            categories.forEach(c => TRACE_CATEGORIES.delete(c));
        }
    }

    // Auto-load from localStorage in browser
    if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('tagmark:trace');
        if (saved) saved.split(',').forEach(c => TRACE_CATEGORIES.add(c.trim()));
    }

    // ---- Utilities ----

    // Stable JSON stringify with sorted keys for consistent marker comparison
    function stableStringify(val) {
        if (val === null) return 'null';
        if (val === undefined) return 'undefined';
        if (typeof val !== 'object') return JSON.stringify(val);
        if (Array.isArray(val)) {
            return '[' + val.map(stableStringify).join(',') + ']';
        }
        const keys = Object.keys(val).sort();
        return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(val[k])).join(',') + '}';
    }

    // ---- Handles ----

    class Handle {
        constructor(root, path = []) {
            this.root = root;
            this.path = Array.isArray(path) ? path : [path];
        }
        extend(seg) { return new Handle(this.root, [...this.path, seg]); }
    }

    function isHandle(obj) {
        return obj instanceof Handle;
    }

    function resolveNamespace(app, root) {
        switch (root) {
            case 'global':
                return app.namespaces.global;
            case 'url':
                return app.namespaces.url;
            default:
                return app.namespaces.locals.get(root);
        }
    }

    function readHandle(app, handle) {
        const base = resolveNamespace(app, handle.root);
        if (base == null) return undefined;
        let cur = base;
        for (const seg of handle.path) {
            if (cur == null) return undefined;
            cur = cur[seg];
        }
        return cur;
    }

    function writeHandle(app, handle, value) {
        const base = resolveNamespace(app, handle.root);
        if (base == null) throw new Error(`Unknown handle root ${handle.root}`);
        let cur = base;
        for (let i = 0; i < handle.path.length - 1; i++) {
            const seg = handle.path[i];
            if (cur[seg] == null) cur[seg] = {};
            cur = cur[seg];
        }
        const last = handle.path[handle.path.length - 1];
        cur[last] = value;
    }

    function snapshotValue(val) {
        if (val == null) return val;
        if (typeof val === 'object') {
            try {
                return structuredClone(val);
            } catch {
                return JSON.parse(JSON.stringify(val));
            }
        }
        return val;
    }

    // ---- SID ----

    function makeSid(parentSid, segment, iteration) {
        const iter = iteration == null ? '' : `::${JSON.stringify(iteration)}`;
        return `${parentSid}/${segment}${iter}`;
    }

    // ---- Scope ----

    class Scope {
        constructor(parent = null) {
            this.parent = parent;
            this.values = Object.create(null);
            this.handles = Object.create(null);
            this.imports = new Set();
        }
        fork() { return new Scope(this); }
        // Case-insensitive lookup helper
        _findCI(obj, name) {
            if (name in obj) return { key: name, value: obj[name] };
            const upperName = name.toUpperCase();
            for (const key of Object.keys(obj)) {
                if (key.toUpperCase() === upperName) return { key, value: obj[key] };
            }
            return null;
        }
        get(name) {
            const valMatch = this._findCI(this.values, name);
            if (valMatch) return valMatch.value;
            const handleMatch = this._findCI(this.handles, name);
            if (handleMatch) return handleMatch.value;
            if (this.parent) return this.parent.get(name);
            // Imports are case-sensitive (they refer to JS globals)
            if (this.imports.has(name)) return globalThis[name];
            return undefined;
        }
        setValue(name, val) {
            // Store with original case, but check for case-collision first
            const existing = this._findCI(this.values, name);
            if (existing && existing.key !== name) {
                throw new Error(`Variable "${name}" conflicts with existing "${existing.key}" (case-insensitive collision)`);
            }
            this.values[name] = val;
            this._flatCache = null; // Invalidate cache
        }
        setHandle(name, handle) {
            // Store with original case, but check for case-collision first
            const existing = this._findCI(this.handles, name);
            if (existing && existing.key !== name) {
                throw new Error(`Handle "@${name}" conflicts with existing "@${existing.key}" (case-insensitive collision)`);
            }
            this.handles[name] = handle;
            this._flatCache = null; // Invalidate cache
        }
        bindImports(names) { names.forEach(n => this.imports.add(n)); }
        flatten() {
            // Cache flattened result since scopes don't mutate during render
            if (this._flatCache) return this._flatCache;
            const parentFlat = this.parent ? this.parent.flatten() : {values: {}, handles: {}};
            this._flatCache = {values: {...parentFlat.values, ...this.values}, handles: {...parentFlat.handles, ...this.handles}};
            return this._flatCache;
        }
    }

    function addDefinitions(app, scope, defAttr) {
        if (!defAttr) return scope;
        const parts = defAttr.split(',').map(s => s.trim()).filter(Boolean);
        for (const part of parts) {
            const [lhs, rhs] = part.split(':=').map(s => s.trim());
            if (!lhs || !rhs) throw new Error('Invalid def syntax');
            if (lhs.startsWith('@')) {
                const handle = parseHandleExpression(scope, rhs);
                scope.setHandle(lhs.slice(1), handle);
            } else if (lhs.startsWith('$')) {
                const expr = rhs.replace(/^\{|\}$/g, '');
                scope.setValue(lhs, app.evalPure(expr, scope));
            } else {
                throw new Error('Invalid def variable');
            }
        }
        return scope;
    }

    function parseHandleExpression(scope, expr) {
        const cleaned = expr.replace(/^@/, '');
        const [rootName, ...rest] = cleaned.split('.');
        const base = scope.get(rootName);
        if (isHandle(base)) {
            return new Handle(base.root, [...base.path, ...rest]);
        }
        return new Handle(rootName, rest);
    }

    // ---- Expressions ----

    const HANDLE_PREFIX = '$H$';

    // Transform @Handle references to $H$Handle for valid JS identifiers
    // Only transforms @name when name (case-insensitive) is a known handle in scope
    function transformHandles(expr, knownHandles) {
        return expr.replace(/@([A-Za-z_]\w*)/g, (m, name) => {
            if (!knownHandles || knownHandles.size === 0) return m;
            const upper = name.toUpperCase();
            for (const h of knownHandles) {
                if (h.toUpperCase() === upper) {
                    return `${HANDLE_PREFIX}${name}`;
                }
            }
            return m;
        });
    }

    // Case-insensitive function evaluator
    // Compiles once, evaluates many times with different env values
    class CaseInsensitiveFunction {
        constructor(expr, { ciPrefixes = ['$', HANDLE_PREFIX] } = {}) {
            this.expr = expr;
            this.ci = ciPrefixes;
            this.fn = null;
            this.params = null;
            this.aliasToCanon = null;
        }

        evaluate(env) {
            if (!this.fn) this._compile(env);

            const ciVars = this._canonicalCI(env);
            const args = [];

            for (const name of this.params) {
                const canon = this.aliasToCanon[name];
                if (canon) {
                    args.push(ciVars[canon]);
                } else if (this._prefix(name)) {
                    args.push(ciVars[name]);
                } else {
                    args.push(env[name]);
                }
            }

            return this.fn(...args);
        }

        _compile(env) {
            const ciVars = this._canonicalCI(env);
            const csNames = [];
            for (const k in env) if (!this._prefix(k)) csNames.push(k);

            const aliasToCanon = this._buildAliases(ciVars);
            const params = this._buildParamNames(ciVars, csNames, aliasToCanon);

            this.fn = new Function(...params, `"use strict";return (${this.expr});`);
            this.params = params;
            this.aliasToCanon = aliasToCanon;
        }

        _canonicalCI(env) {
            const ciVars = Object.create(null);
            for (const k in env) {
                const p = this._prefix(k);
                if (!p) continue;
                const canon = p + k.slice(p.length).toUpperCase();
                const v = env[k];
                if (canon in ciVars && ciVars[canon] !== v) {
                    throw new Error(`Conflicting values for case-insensitive identifier "${canon}".`);
                }
                ciVars[canon] = v;
            }
            return ciVars;
        }

        _prefix(name) {
            for (const p of this.ci) if (name.startsWith(p)) return p;
            return null;
        }

        _buildAliases(ciVars) {
            const aliasToCanon = Object.create(null);
            if (!Object.keys(ciVars).length) return aliasToCanon;

            // Build regex that matches any prefix followed by identifier
            // Sort prefixes by length descending so longer ones match first
            const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const sortedPrefixes = [...this.ci].sort((a, b) => b.length - a.length);
            const prefixPattern = sortedPrefixes.map(esc).join('|');
            const re = new RegExp(`(${prefixPattern})([A-Za-z_]\\w*)`, 'g');
            const seen = new Set();

            this.expr.replace(re, (m, p, id) => {
                const raw = p + id;
                if (seen.has(raw)) return m;
                seen.add(raw);
                const canon = p + id.toUpperCase();
                if (canon in ciVars && raw !== canon) aliasToCanon[raw] = canon;
                return m;
            });

            return aliasToCanon;
        }

        _buildParamNames(ciVars, csNames, aliasToCanon) {
            const params = [];
            for (const k in ciVars) params.push(k);
            for (const a in aliasToCanon) params.push(a);
            for (const k of csNames) params.push(k);
            return params;
        }
    }

    function handlesKey(handles) {
        // Cache on the handles object itself since flatten() is already cached
        if (handles._keyCache !== undefined) return handles._keyCache;
        const names = Object.keys(handles);
        if (!names.length) {
            handles._keyCache = '';
            return '';
        }
        handles._keyCache = names.map(n => n.toUpperCase()).sort().join(',');
        return handles._keyCache;
    }

    // Compile expression with scope-aware handle transformation and caching
    function compileExpr(expr, flatScope, cache, stats) {
        const cacheKey = `${expr}||${handlesKey(flatScope.handles)}`;
        if (cache && cache.has(cacheKey)) return cache.get(cacheKey);

        const knownHandles = new Set(Object.keys(flatScope.handles));
        const transformed = transformHandles(expr, knownHandles);
        const compiled = new CaseInsensitiveFunction(transformed);

        if (stats) stats.compiled++;
        if (cache) cache.set(cacheKey, compiled);
        return compiled;
    }

    function freezeDeep(val, seen = new Set()) {
        if (val == null || typeof val !== 'object' || seen.has(val)) return val;
        seen.add(val);
        Object.values(val).forEach(v => freezeDeep(v, seen));
        return Object.freeze(val);
    }

    // Unwrap DeepProxy to get underlying value (for DOM objects with native getters)
    function unwrapProxy(val) {
        if (val && typeof val === 'object' && val.__isReactiveProxy && val.__unwrap) {
            return val.__unwrap;
        }
        return val;
    }

    function makeHandleProxy(app, handle, mode = 'effect') {
        return new Proxy(() => {}, {
            get: (_, prop) => {
                if (prop === '__isHandleProxy') return true;
                const base = readHandle(app, handle);

                // valueOf: return current value (frozen snapshot in pure mode)
                if (prop === 'valueOf') {
                    if (mode === 'pure' && typeof base !== 'function') {
                        return () => freezeDeep(snapshotValue(base));
                    }
                    return () => base;
                }

                // Symbol.toPrimitive: allow coercion to work
                if (prop === Symbol.toPrimitive) {
                    return (hint) => {
                        if (base == null) return hint === 'string' ? '' : undefined;
                        if (typeof base[Symbol.toPrimitive] === 'function') {
                            return base[Symbol.toPrimitive](hint);
                        }
                        return hint === 'string' ? String(base) : base;
                    };
                }

                // Null-safe chaining: if base is null/undefined, return a proxy that
                // continues the chain but reads as undefined
                if (base == null) {
                    return makeHandleProxy(app, handle.extend(prop), mode);
                }

                // Try to access property; if "Illegal invocation" error, unwrap and retry
                // (happens with DOM objects like File, FileList that have native getters)
                let val;
                try {
                    val = base[prop];
                } catch (e) {
                    if (e.message?.includes('Illegal invocation')) {
                        val = unwrapProxy(base)[prop];
                    } else {
                        throw e;
                    }
                }

                // Always return nested proxy for objects (both pure and effect modes)
                if (val && typeof val === 'object') {
                    return makeHandleProxy(app, handle.extend(prop), mode);
                }

                // Functions: bind to base so `this` works correctly
                if (typeof val === 'function') {
                    return val.bind(base);
                }

                // Primitives: return as-is (proxy set trap still guards mutations)
                return val;
            },
            set: (_, prop, value) => {
                if (mode === 'pure') throw new Error('Pure expressions must not mutate state');
                writeHandle(app, handle.extend(prop), value);
                return true;
            },
        });
    }

    // Build flat env object for CaseInsensitiveFunction
    // Variables are passed as-is, handles are prefixed with $H$ and wrapped in proxies
    function buildEnv(app, flat, mode) {
        const env = {};

        // Add variables (keep original names with $ prefix)
        for (const [k, v] of Object.entries(flat.values)) {
            env[k] = v;
        }

        // Add handles with $H$ prefix, wrapped in proxies
        for (const [k, v] of Object.entries(flat.handles)) {
            env[HANDLE_PREFIX + k] = makeHandleProxy(app, v, mode);
        }

        return env;
    }

    function evalPure(app, expr, scope) {
        const flat = scope.flatten();
        const compiled = compileExpr(expr, flat, app._exprCache, app._exprCacheStats);
        const env = buildEnv(app, flat, 'pure');
        return compiled.evaluate(env);
    }

    function evalEffect(app, expr, scope) {
        const flat = scope.flatten();
        const compiled = compileExpr(expr, flat, app._exprCache, app._exprCacheStats);
        const env = buildEnv(app, flat, 'effect');
        return compiled.evaluate(env);
    }

    // ---- Shared ActDown Singleton ----
    // All <tag-mark> roots on a page share this single instance

    let sharedActDown = null;
    let globalNamespace = null;
    let urlNamespace = null;

    function getSharedActDown() {
        if (!sharedActDown) {
            // Create the singleton (prefer isolated instance if available)
            sharedActDown = ActDown.create ? ActDown.create() : ActDown;
            // Apply forms extension to this instance if available
            if (typeof ActDownExtForms !== 'undefined' && ActDownExtForms.formExtension) {
                ActDownExtForms.formExtension(sharedActDown);
            }
            // Create global namespaces
            globalNamespace = sharedActDown.stateForId('global');
            urlNamespace = sharedActDown.stateForId('url');
        }
        return sharedActDown;
    }

    // ---- Main Runtime ----

    class TagMarkRuntime {
        constructor() {
            this.act = null; // Lazily set during bootstrap
            this.namespaces = {
                global: null,
                url: null,
                locals: new Map(),
            };
            this.templates = new Map();
            this.slots = new Map();
            this._globalInitialized = false;
            this._exprCache = new Map();
            this._exprCacheStats = { compiled: 0 };
            this._parseCache = new Map(); // Cache for parsed interpolation structure
            this._compileCheckCache = new Map(); // Cache for _canCompile results
        }

        ensureActDown() {
            if (!this.act) {
                this.act = getSharedActDown();
                this.namespaces.global = globalNamespace;
                this.namespaces.url = urlNamespace;
            }
        }

        evalPure(expr, scope) { return evalPure(this, expr, scope); }
        evalEffect(expr, scope) { return evalEffect(this, expr, scope); }

        ensureLocalNamespace(sid, initObj) {
            if (!this.namespaces.locals.has(sid)) {
                const proxy = this.act.stateForId(`local:${sid}`, () => initObj || {});
                this.namespaces.locals.set(sid, proxy);
            }
            return this.namespaces.locals.get(sid);
        }

        clearNamespace(sid) {
            const proxy = this.namespaces.locals.get(sid);
            if (proxy) {
                Object.keys(proxy).forEach(k => delete proxy[k]);
            }
        }

        resetExprCache() {
            this._exprCache.clear();
            this._exprCacheStats.compiled = 0;
            this._parseCache.clear();
        }

        getExprCacheStats() {
            return { cacheSize: this._exprCache.size, compiled: this._exprCacheStats.compiled, parseCache: this._parseCache.size };
        }

        bootstrap() {
            // 1. Process <tag-mark-global> if present (must come before any <tag-mark>)
            this.processGlobalInit();

            // 2. Ensure ActDown singleton exists (lazy creation if no <tag-mark-global>)
            this.ensureActDown();

            // 3. Process all <tag-mark> roots
            document.querySelectorAll('tag-mark').forEach((root, idx) => {
                this.collectTemplates(root);
                // Capture template children and attributes BEFORE mounting (ActDown clears innerHTML)
                const templateNodes = Array.from(root.childNodes).map(n => n.cloneNode(true));
                const rootAttrs = {
                    init: root.getAttribute('init'),
                    def: root.getAttribute('def'),
                    import: root.getAttribute('import'),
                    id: root.getAttribute('id')
                };
                const renderFn = () => {
                    const vdom = this.renderRoot(templateNodes, idx, rootAttrs);
                    trace('render', () => ['VDOM', JSON.parse(JSON.stringify(vdom, (k, v) => typeof v === 'function' ? '[Function]' : v))]);
                    return vdom;
                };
                this.act.mount(renderFn, root);
            });
            this.setupUrlSync();
        }

        processGlobalInit() {
            const globalElements = document.querySelectorAll('tag-mark-global');

            // Check for multiple <tag-mark-global> (hard error)
            if (globalElements.length > 1) {
                throw new Error('Only one <tag-mark-global> element is allowed per page');
            }

            if (globalElements.length === 0) return;

            const globalEl = globalElements[0];

            // Check that <tag-mark-global> comes before any <tag-mark>
            const firstTagMark = document.querySelector('tag-mark');
            if (firstTagMark && globalEl.compareDocumentPosition(firstTagMark) & Node.DOCUMENT_POSITION_PRECEDING) {
                throw new Error('<tag-mark-global> must appear before any <tag-mark> element');
            }

            // Create the ActDown singleton now
            this.ensureActDown();

            // Process imports
            const importAttr = globalEl.getAttribute('import');
            const baseScope = new Scope();
            if (importAttr) {
                baseScope.bindImports(importAttr.split(',').map(s => s.trim()).filter(Boolean));
            }

            // Process init - result is deep-merged into @Global
            const initAttr = globalEl.getAttribute('init');
            if (initAttr) {
                const expr = initAttr.replace(/^\{|\}$/g, '');
                try {
                    const initObj = this.evalPure(expr, baseScope);
                    if (initObj && typeof initObj === 'object') {
                        // Deep merge into @Global
                        this.deepMerge(this.namespaces.global, initObj);
                    }
                } catch (e) {
                    throw new Error(`Error in <tag-mark-global> init: ${e.message}`);
                }
            }

            // Remove the element from DOM (it's purely declarative)
            globalEl.remove();
            this._globalInitialized = true;
        }

        deepMerge(target, source) {
            for (const key of Object.keys(source)) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    if (!target[key] || typeof target[key] !== 'object') {
                        target[key] = {};
                    }
                    this.deepMerge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        }

        collectTemplates(root) {
            root.querySelectorAll('*').forEach(node => {
                if (node.tagName && node.tagName.includes(':TEMPLATE')) {
                    const name = node.tagName.split(':')[0].toUpperCase();
                    const params = (node.getAttribute('params') || '').split(',').map(s => s.trim()).filter(Boolean);
                    const templateInit = node.getAttribute('init');
                    // Clone template children before removing from DOM
                    const templateChildren = Array.from(node.childNodes).map(n => n.cloneNode(true));

                    // Store template metadata for later use
                    this.templates.set(name, { templateChildren, params, templateInit });

                    // Register as ActDown component
                    const self = this;
                    this.act.def(name, ({ props, children }) => {
                        return self.renderComponentInstance(name, props, children);
                    });

                    node.remove();
                }
            });
        }

        renderRoot(templateNodes, idx, rootAttrs = {}) {
            const sid = `TAG-MARK#${idx}`;
            const baseScope = new Scope();
            baseScope.setHandle('Global', new Handle('global'));
            baseScope.setHandle('Url', new Handle('url'));

            // Process import attribute
            if (rootAttrs.import) {
                baseScope.bindImports(rootAttrs.import.split(',').map(s => s.trim()).filter(Boolean));
            }

            // Process def attribute - check for "as local" pattern first
            const defAttr = rootAttrs.def;
            const asLocalMatch = defAttr && defAttr.match(/@(\w+)\s+as\s+local/);
            const localHandle = asLocalMatch ? new Handle(sid) : null;
            if (localHandle) {
                this.ensureLocalNamespace(sid, {});
                baseScope.setHandle(asLocalMatch[1], localHandle);
            }
            const cleanedDef = defAttr && asLocalMatch ? defAttr.replace(/@\w+\s+as\s+local,?\s*/, '').trim() : defAttr;
            if (cleanedDef) addDefinitions(this, baseScope, cleanedDef);

            // Process init attribute (requires local handle)
            if (rootAttrs.init && localHandle) {
                const initKey = `${sid}:init`;
                if (!this._initRun) this._initRun = new Set();
                if (!this._initRun.has(initKey)) {
                    this._initRun.add(initKey);
                    const expr = rootAttrs.init.replace(/^\{|\}$/g, '');
                    const initObj = this.evalPure(expr, baseScope);
                    if (initObj && typeof initObj === 'object') {
                        Object.assign(this.namespaces.locals.get(sid), initObj);
                    }
                }
            }

            const children = this.renderChildren(templateNodes, baseScope, sid);
            return this.act.v('div', {}, ...children);
        }

        // Render a list of child nodes, tracking When/Else context across siblings
        // opts.slotContext flows down from component templates to reach <Name:Slot> placeholders
        renderChildren(childNodes, scope, parentSid, opts = {}) {
            const nodes = Array.from(childNodes);
            const results = [];
            let whenContext = null;

            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const tag = node.nodeType === Node.ELEMENT_NODE ? node.tagName.toUpperCase() : null;

                // Reset whenContext when we hit a non-When/Else element
                if (tag && tag !== 'WHEN' && tag !== 'ELSE') {
                    whenContext = null;
                }

                // Create new whenContext for a When block
                if (tag === 'WHEN') {
                    whenContext = { matched: false };
                }

                // Preserve slotContext from parent, add local whenContext
                const result = this.renderNode(node, scope, parentSid, `${i}`, { ...opts, whenContext });
                if (result != null) results.push(result);
            }

            return results;
        }

        renderNode(node, scope, parentSid, seg, opts = {}) {
            if (node.nodeType === Node.TEXT_NODE) {
                const txt = this.interpolateText(node.textContent, scope);
                return txt;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return null;
            const tag = node.tagName.toUpperCase();
            if (tag.endsWith(':SLOT')) return this.renderSlot(node, scope, parentSid, seg, opts.slotContext);
            if (tag === 'LOOP') return this.renderLoop(node, scope, parentSid, seg);
            if (tag === 'WHEN' || tag === 'ELSE') return this.renderWhen(node, scope, parentSid, seg, opts.whenContext);
            if (tag === 'URL') return this.renderUrl(node, scope, parentSid, seg);
            // Check if this is a registered component (via ActDown's registry)
            if (this.act._internal.comps.has(tag)) return this.renderComponentUsage(node, scope, parentSid, seg);
            if (tag === 'FORM') return this.renderForm(node, scope, parentSid, seg);
            return this.renderElement(node, scope, parentSid, seg, opts);
        }

        // Check if expression is syntactically valid JS (compiles)
        // Takes scope to properly transform handles before syntax check
        // Uses internal cache to avoid repeated compilation attempts
        _canCompile(expr, scope) {
            const flat = scope.flatten();
            const cacheKey = `${expr}||${handlesKey(flat.handles)}`;

            if (this._compileCheckCache.has(cacheKey)) {
                return this._compileCheckCache.get(cacheKey);
            }

            let result;
            try {
                const knownHandles = new Set(Object.keys(flat.handles));
                const transformed = transformHandles(expr, knownHandles);
                new Function(`"use strict";return (${transformed});`);
                result = true;
            } catch {
                result = false;
            }

            this._compileCheckCache.set(cacheKey, result);
            return result;
        }

        // Parse interpolated string - caches the structure (literal vs expr positions)
        // Returns { parts: [{type: 'lit'|'expr'|'error', value: any}...], singleExpr: bool }
        _parseStructure(text, scope) {
            const s = String(text);
            const flat = scope.flatten();
            const cacheKey = `${s}||${handlesKey(flat.handles)}`;

            if (this._parseCache.has(cacheKey)) {
                return this._parseCache.get(cacheKey);
            }

            // Parse structure: array of {type: 'lit', value: string} or {type: 'expr', expr: string}
            const structure = [];
            let i = 0;

            while (i < s.length) {
                const open = s.indexOf('{', i);
                if (open === -1) {
                    if (i < s.length) structure.push({ type: 'lit', value: s.slice(i) });
                    break;
                }

                if (open > i) structure.push({ type: 'lit', value: s.slice(i, open) });

                let found = false;
                for (let j = open + 1; j <= s.length; j++) {
                    if (s[j] !== '}') continue;
                    const body = s.slice(open + 1, j).trim();
                    if (!this._canCompile(body, scope)) continue;

                    structure.push({ type: 'expr', expr: body });
                    i = j + 1;
                    found = true;
                    break;
                }

                if (!found) {
                    structure.push({ type: 'lit', value: '{' });
                    i = open + 1;
                }
            }

            const singleExpr = structure.length === 1 && structure[0].type === 'expr';
            const result = { structure, singleExpr };
            this._parseCache.set(cacheKey, result);
            return result;
        }

        // Parse and evaluate interpolated string
        // Returns { parts: [{type: 'lit'|'expr'|'error', value: any}...], singleExpr: bool }
        parseInterpolationParts(text, scope) {
            if (text == null) return { parts: [], singleExpr: false };
            const s = String(text);
            if (s.indexOf('{') === -1) return { parts: [{ type: 'lit', value: s }], singleExpr: false };

            const { structure, singleExpr } = this._parseStructure(text, scope);

            // Evaluate expressions using cached structure
            const parts = structure.map(item => {
                if (item.type === 'lit') return item;
                try {
                    const v = this.evalPure(item.expr, scope);
                    return { type: 'expr', value: v };
                } catch (e) {
                    return { type: 'error', value: e };
                }
            });

            return { parts, singleExpr };
        }

        // Interpolate and return string; throws if any part is an error
        interpolateText(text, scope) {
            const { parts } = this.parseInterpolationParts(text, scope);
            return parts.map(p => {
                if (p.type === 'error') {
                    // Surface error in text but also throw it to global error handler
                    setTimeout(() => { throw p.value; }, 0);
                    return `[Error: ${p.value.message}]`;
                }
                return p.value == null ? '' : String(p.value);
            }).join('');
        }

        // Interpolate; if single expression, return raw value (preserves type); throws on error
        interpolateValue(text, scope) {
            const { parts, singleExpr } = this.parseInterpolationParts(text, scope);
            for (const p of parts) {
                if (p.type === 'error') throw p.value;
            }
            if (singleExpr) return parts[0].value;
            return parts.map(p => p.value == null ? '' : String(p.value)).join('');
        }

        renderAttributes(node, scope) {
            const BOOLEAN_ATTRS = new Set([
                'disabled', 'checked', 'readonly', 'required', 'autofocus',
                'autoplay', 'controls', 'loop', 'muted', 'default', 'defer',
                'hidden', 'ismap', 'multiple', 'novalidate', 'open', 'reversed',
                'selected', 'async', 'formnovalidate', 'nomodule', 'playsinline'
            ]);

            const props = {};
            for (const attr of node.attributes) {
                const name = attr.name;
                const val = attr.value;
                if (name === 'def' || name === 'test' || name === 'each' || name === 'params' || name === 'init' || name === 'marker' || name === 'import' || name === 'clear-on-unmount' || name === 'bind') continue;
                if (name.startsWith('on')) {
                    const handler = val.trim();
                    if (handler.startsWith('@{') && handler.endsWith('}')) {
                        const expr = handler.slice(2, -1);
                        props[name] = (ev) => {
                            const s = scope.fork();
                            s.setValue('$event', ev);
                            return this.evalEffect(expr, s);
                        };
                    }
                    continue;
                }
                const v = this.interpolateValue(val, scope);

                // Boolean attributes: omit if false, "false", null, or undefined
                if (BOOLEAN_ATTRS.has(name)) {
                    if (v === false || v === 'false' || v == null) continue;
                    props[name] = true;
                } else {
                    if (v != null) props[name] = v;
                }
            }
            return props;
        }

        applyInit(node, scope, sid, localHandle) {
            const initAttr = node.getAttribute('init');
            if (!initAttr) return;
            const expr = initAttr.replace(/^\{|\}$/g, '');
            if (!this._initRun) this._initRun = new Set();
            const key = `${sid}`;
            if (this._initRun.has(key)) return;
            this._initRun.add(key);
            let obj;
            try {
                obj = this.evalPure(expr, scope);
            } catch (e) {
                // Check for common mistake: init="{key: val}" instead of init="{ {key: val} }"
                if (expr.includes(':') && !expr.trim().startsWith('{')) {
                    throw new Error(
                        `Invalid init syntax: "${initAttr}". ` +
                        `Object literals need double braces: init="{ {key: value} }"`
                    );
                }
                throw e;
            }
            this.ensureLocalNamespace(sid, obj || {});
            if (localHandle) {
                const target = this.namespaces.locals.get(sid);
                if (target) Object.assign(target, obj || {});
            }
        }

        renderElement(node, scope, parentSid, seg, opts = {}) {
            const sid = makeSid(parentSid, seg);
            const defAttr = node.getAttribute('def');
            const asLocalMatch = defAttr && defAttr.match(/@(\w+)\s+as\s+local/);
            const localHandle = asLocalMatch ? new Handle(sid) : null;
            if (localHandle) {
                this.ensureLocalNamespace(sid, {});
            }
            const sc = scope.fork();
            if (localHandle && asLocalMatch) {
                sc.setHandle(asLocalMatch[1], localHandle);
            }
            if (node.getAttribute('import')) sc.bindImports(node.getAttribute('import').split(',').map(s => s.trim()).filter(Boolean));
            const cleanedDef = defAttr && asLocalMatch ? defAttr.replace(/@\w+\s+as\s+local,?\s*/, '').trim() : defAttr;
            if (cleanedDef) addDefinitions(this, sc, cleanedDef);
            const testAttr = node.getAttribute('test');
            if (testAttr && !this.evalPure(testAttr.replace(/^\{|\}$/g, ''), sc)) return null;
            this.applyInit(node, sc, sid, localHandle);
            const props = this.renderAttributes(node, sc);
            this.applyFormBinding(node, sc, props);
            props.key = sid;
            const children = this.renderChildren(node.childNodes, sc, sid, opts);
            return this.act.v(node.tagName.toLowerCase(), props, ...children);
        }

        applyFormBinding(node, scope, props) {
            const tag = node.tagName.toUpperCase();
            const isFormElement = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
            const isCustomElement = tag.includes('-');

            if (!isFormElement && !isCustomElement) return;

            const nameAttr = node.getAttribute('name');
            const bindAttr = node.getAttribute('bind');
            const formHandle = scope.get('Form');

            // For form elements: use bind attr or auto-bind via name + @Form
            // For custom elements: only use explicit bind attr
            const expr = isFormElement
                ? (bindAttr || (formHandle && nameAttr ? `@Form.${nameAttr}` : null))
                : bindAttr;
            if (!expr) return;

            const handle = parseHandleExpression(scope, expr.replace(/^\{|\}$/g, ''));
            const current = () => readHandle(this, handle);
            const type = (props.type || '').toLowerCase();

            if (tag === 'INPUT' && (type === 'checkbox' || type === 'radio')) {
                const valAttr = props.value;
                props.checked = type === 'radio' ? current() === valAttr : !!current();
                if (!props.onchange) {
                    props.onchange = (ev) => {
                        const next = type === 'radio'
                            ? (ev.target.checked ? valAttr : current())
                            : (ev.target.checked ? (valAttr ?? true) : false);
                        writeHandle(this, handle, next);
                    };
                }
            } else if (tag === 'INPUT' && type === 'file') {
                // File inputs: bind FileList on change
                if (!props.onchange) {
                    props.onchange = (ev) => writeHandle(this, handle, ev.target.files);
                }
            } else if (tag === 'SELECT' && node.hasAttribute('multiple')) {
                // Multiple select: bind array of selected values
                const getSelected = (sel) => Array.from(sel.selectedOptions).map(o => o.value);
                // Don't set value prop for multiple select
                if (!props.onchange) {
                    props.onchange = (ev) => writeHandle(this, handle, getSelected(ev.target));
                }
            } else if (isFormElement) {
                props.value = current();
                const writer = (ev) => writeHandle(this, handle, ev.target.value);
                if (!props.oninput) props.oninput = writer;
                if (!props.onchange) props.onchange = writer;
            } else {
                // Custom element: just set value property, don't auto-wire events
                props.value = current();
            }
        }

        renderWhen(node, scope, parentSid, seg, whenContext) {
            const sid = makeSid(parentSid, seg);
            const sc = scope.fork();
            addDefinitions(this, sc, node.getAttribute('def'));
            const testAttr = node.getAttribute('test');
            const ok = testAttr ? !!this.evalPure(testAttr.replace(/^\{|\}$/g, ''), sc) : true;
            if (!whenContext) whenContext = {matched: false};
            if (whenContext.matched) return null;
            if (node.tagName.toUpperCase() === 'WHEN' && ok) {
                whenContext.matched = true;
                const children = Array.from(node.childNodes).map((n, i) => this.renderNode(n, sc, sid, `${i}`, {whenContext})).filter(Boolean);
                return this.act.v('div', {key: sid}, ...children);
            }
            if (node.tagName.toUpperCase() === 'ELSE' && (ok || node.getAttribute('test') == null)) {
                whenContext.matched = true;
                const children = Array.from(node.childNodes).map((n, i) => this.renderNode(n, sc, sid, `${i}`, {whenContext})).filter(Boolean);
                return this.act.v('div', {key: sid}, ...children);
            }
            return null;
        }

        // Parse Loop each attribute using "first-compiles" rule for balanced braces
        // Format: "$var as role, ... of {expression} marked by {marker}" or "marked by index/field"
        parseEach(attr, scope) {
            // Find " of " (with flexible whitespace) to split bindings from expression
            const ofMatch = attr.match(/\s+of\s+\{/);
            if (!ofMatch) throw new Error('Invalid each syntax: missing "of {expression}"');
            const ofIdx = ofMatch.index;

            const bindings = attr.slice(0, ofIdx).split(',').map(s => s.trim()).filter(Boolean);

            // Find the opening brace position
            const braceStart = ofIdx + ofMatch[0].length - 1; // position of the '{'

            // Try each '}' to find the one that produces valid JS (same algorithm as parseInterpolationParts)
            let exprEnd = -1;
            let expr = '';
            for (let i = braceStart + 1; i < attr.length; i++) {
                if (attr[i] !== '}') continue;
                const candidate = attr.slice(braceStart + 1, i).trim();
                if (this._canCompile(candidate, scope)) {
                    expr = candidate;
                    exprEnd = i;
                    break;
                }
            }
            if (exprEnd === -1) throw new Error('Invalid each syntax: no valid expression found in braces');

            // Rest should be " marked by ..."
            const rest = attr.slice(exprEnd + 1).trim();
            const markerMatch = rest.match(/^marked by (.+)$/);
            if (!markerMatch) throw new Error('Invalid each syntax: missing "marked by"');

            const marker = markerMatch[1].trim();
            return { bindings, expr, marker };
        }

        renderLoop(node, scope, parentSid, seg) {
            const sid = makeSid(parentSid, `LOOP${seg}`);
            const sc = scope.fork();
            addDefinitions(this, sc, node.getAttribute('def'));
            const each = node.getAttribute('each');
            if (!each) throw new Error('Loop missing each');
            const {bindings, expr, marker} = this.parseEach(each, sc);
            let collection = this.evalPure(expr, sc) || [];
            // Unwrap proxy if needed (proxies have valueOf that returns the underlying value)
            if (collection && typeof collection.valueOf === 'function' && collection.__isHandleProxy) {
                collection = collection.valueOf();
            }
            collection = collection || [];
            const items = Array.isArray(collection) ? [...collection.entries()] : Object.entries(collection);
            const rendered = [];
            const seenMarkers = new Set();
            let index = 0;
            const lastIndex = items.length - 1;
            for (const [k, v] of items) {
                const iterScope = sc.fork();
                bindings.forEach(b => {
                    const [varName, role] = b.split(' as ').map(s => s.trim());
                    // Keep $prefix for variable names so expressions can reference $user, $i, etc.
                    switch (role) {
                        case 'index': iterScope.setValue(varName, index); break;
                        case 'field': iterScope.setValue(varName, k); break;
                        case 'value': iterScope.setValue(varName, v); break;
                        case 'isFirst': iterScope.setValue(varName, index === 0); break;
                        case 'isLast': iterScope.setValue(varName, index === lastIndex); break;
                        default: iterScope.setValue(varName, v);
                    }
                });
                const markVal = marker === 'index' ? index : marker === 'field' ? k : this.evalPure(marker.replace(/^\{|\}$/g, ''), iterScope);
                // Check for duplicate markers using stable stringify for consistent comparison
                const markKey = stableStringify(markVal);
                if (seenMarkers.has(markKey)) {
                    throw new Error(`Duplicate loop marker: ${markKey}`);
                }
                seenMarkers.add(markKey);
                const childSid = makeSid(sid, seg, markVal);
                const kids = Array.from(node.childNodes).map((n, i) => this.renderNode(n, iterScope, childSid, `${i}`)).filter(Boolean);
                rendered.push(...kids);
                index++;
            }
            if (rendered.length === 0) {
                const next = node.nextElementSibling;
                if (next && next.tagName.toUpperCase() === 'ELSE') {
                    return this.renderWhen(next, scope, parentSid, `${seg}-else`, {matched: false});
                }
            }
            // Return array (fragment) so Loop doesn't add a wrapper element that breaks CSS layouts
            return rendered;
        }

        renderComponentUsage(node, scope, parentSid, seg) {
            const tag = node.tagName;
            const name = tag.toUpperCase();
            const template = this.templates.get(name);
            if (!template) return this.renderElement(node, scope, parentSid, seg);

            const sid = makeSid(parentSid, `${name}${seg}`);

            // Evaluate params in the usage-site scope
            // Params starting with @ are handle params, otherwise value params
            // The $ prefix on value params is part of the variable name (convention, not sigil)
            const $params = {};
            const $handles = {};
            (template.params || []).forEach(p => {
                const paramName = p.trim();
                if (paramName.startsWith('@')) {
                    // Handle param: @foo means bind a handle
                    const handleName = paramName.slice(1); // Remove @
                    const attrVal = node.getAttribute(handleName);
                    const expr = attrVal ? attrVal.replace(/^\{|\}$/g, '') : `@${handleName}`;
                    $handles[handleName] = parseHandleExpression(scope, expr);
                } else {
                    // Value param: $foo or foo - attribute name is without $
                    const attrName = paramName.startsWith('$') ? paramName.slice(1) : paramName;
                    const attrVal = node.getAttribute(attrName);
                    if (attrVal == null) {
                        $params[paramName] = undefined;
                    } else if (attrVal.startsWith('{') && attrVal.endsWith('}')) {
                        // Expression: evaluate it
                        const expr = attrVal.slice(1, -1);
                        $params[paramName] = this.evalPure(expr, scope);
                    } else {
                        // Literal string value
                        $params[paramName] = attrVal;
                    }
                }
            });

            // Determine slot names from template
            const slotNames = new Set();
            const templateChildren = template.templateChildren || [];
            const walkForSlots = (nodes) => {
                nodes.forEach(n => {
                    if (n.nodeType === Node.ELEMENT_NODE) {
                        const t = n.tagName?.toUpperCase();
                        if (t && t.endsWith(':SLOT')) {
                            const slotName = t.split(':')[0];
                            slotNames.add(slotName === name ? 'DEFAULT' : slotName);
                        }
                        walkForSlots(Array.from(n.childNodes));
                    }
                });
            };
            walkForSlots(templateChildren);

            // Render usage-site children in usage-site scope, separating into slots
            const $slots = {};
            const defaultSlotContent = [];
            Array.from(node.childNodes).forEach((ch, i) => {
                if (ch.nodeType === Node.ELEMENT_NODE) {
                    const chName = ch.tagName.toUpperCase();
                    if (slotNames.has(chName) && chName !== 'DEFAULT') {
                        // Named slot - render its children
                        const rendered = Array.from(ch.childNodes)
                            .map((n, j) => this.renderNode(n, scope, sid, `slot-${chName}-${j}`))
                            .filter(Boolean);
                        $slots[chName] = ($slots[chName] || []).concat(rendered);
                        return;
                    }
                }
                // Default slot content
                const rendered = this.renderNode(ch, scope, sid, `default-${i}`);
                if (rendered != null) defaultSlotContent.push(rendered);
            });

            // Get usage-site init (overrides template init)
            const usageInit = node.getAttribute('init');

            // Collect passthrough attributes (not special attrs, not declared params)
            const specialAttrs = new Set(['init', 'def', 'import']);
            const paramAttrNames = new Set((template.params || []).map(p => {
                const paramName = p.trim();
                if (paramName.startsWith('@')) return paramName.slice(1);
                if (paramName.startsWith('$')) return paramName.slice(1);
                return paramName;
            }));
            const $passthrough = {};
            for (const attr of node.attributes) {
                if (!specialAttrs.has(attr.name) && !paramAttrNames.has(attr.name)) {
                    $passthrough[attr.name] = this.interpolateValue(attr.value, scope);
                }
            }

            // Emit ActDown component vnode
            // ActDown will call renderComponentInstance via the registered component function
            // Passthrough attrs are spread directly; $-prefixed props are internal
            return this.act.v(name, {
                key: sid,
                $sid: sid,
                $params,
                $handles,
                $slots,
                $usageInit: usageInit,
                ...$passthrough
            }, ...defaultSlotContent);
        }

        // Called by ActDown when it expands a component registered via act.def()
        renderComponentInstance(name, props, children) {
            const template = this.templates.get(name);
            if (!template) {
                throw new Error(`Template not found: ${name}`);
            }

            // Extract internal $-prefixed props, rest are passthrough attrs
            const { $sid: sid, $params, $handles, $slots, $usageInit, key, ...passthrough } = props;
            const { templateChildren, params, templateInit } = template;

            // Create component scope
            const sc = new Scope();
            const localHandle = new Handle(sid);
            sc.setHandle(name, localHandle);
            sc.setHandle('Global', new Handle('global'));
            sc.setHandle('Url', new Handle('url'));

            // Bind params (names already include $ prefix if applicable)
            for (const [k, v] of Object.entries($params || {})) {
                sc.setValue(k, v);
            }
            for (const [k, v] of Object.entries($handles || {})) {
                sc.setHandle(k, v);
            }

            // Check for double init (both template and usage have init) - this is an error
            if ($usageInit && templateInit) {
                throw new Error(
                    `Component <${name}> has init on both template and usage site. ` +
                    `Use init on the template OR on the usage, not both.`
                );
            }

            // Apply init (usage-site overrides template) - only once per SID
            // Important: create namespace WITH init values, not empty then assign
            const initAttr = $usageInit || templateInit;
            if (!this._initRun) this._initRun = new Set();
            if (!this._initRun.has(sid)) {
                this._initRun.add(sid);
                if (initAttr) {
                    const expr = initAttr.replace(/^\{|\}$/g, '');
                    const obj = this.evalPure(expr, sc);
                    this.ensureLocalNamespace(sid, obj || {});
                } else {
                    this.ensureLocalNamespace(sid, {});
                }
            } else {
                // Namespace already exists from previous render, just ensure it's accessible
                this.ensureLocalNamespace(sid, {});
            }

            // Build slot context for template rendering
            const slotContext = {
                slots: new Map(Object.entries($slots || {})),
                defaultSlot: children || [],
                templateName: name
            };

            // Render template body
            const body = templateChildren
                .map((n, i) => this.renderNode(n, sc, sid, `${i}`, { slotContext }))
                .filter(Boolean);

            // If passthrough attrs exist, wrap in a div with those attrs
            // Otherwise return as fragment (array) - ActDown will flatten
            if (Object.keys(passthrough).length > 0) {
                return this.act.v('div', { key: sid, ...passthrough }, ...body);
            }
            return body;
        }

        renderSlot(node, scope, parentSid, seg, slotContext = {}) {
            const sid = makeSid(parentSid, `SLOT${seg}`);
            const tag = node.tagName.toUpperCase();
            const slotName = tag.split(':')[0];
            const key = slotName === slotContext.templateName ? 'DEFAULT' : slotName;

            // Slots now contain pre-rendered vdom (rendered at usage site in usage scope)
            const provided = slotContext.slots?.get(key) || (key === 'DEFAULT' ? slotContext.defaultSlot : null);
            const useFallback = !provided || provided.length === 0;

            if (useFallback) {
                // Render fallback content from template (in template scope)
                const fallbackNodes = Array.from(node.childNodes);
                const children = fallbackNodes
                    .map((n, i) => this.renderNode(n, scope, sid, `${i}`, { slotContext }))
                    .filter(Boolean);
                return this.act.v('div', { key: sid }, ...children);
            }

            // Use pre-rendered slot content (already vdom)
            return this.act.v('div', { key: sid }, ...provided);
        }

        renderForm(node, scope, parentSid, seg) {
            const sid = makeSid(parentSid, `FORM${seg}`);
            const sc = scope.fork();
            const bindAttr = node.getAttribute('bind');
            const formHandle = bindAttr
                ? parseHandleExpression(scope, bindAttr.replace(/^\{|\}$/g, ''))
                : new Handle(sid);

            if (!bindAttr) {
                // Local form state - use applyInit which handles init-once tracking
                this.applyInit(node, sc, sid, formHandle);
                // Ensure namespace exists even without init
                this.ensureLocalNamespace(sid, {});
            }

            sc.setHandle('Form', formHandle);
            addDefinitions(this, sc, node.getAttribute('def'));
            const props = this.renderAttributes(node, sc);
            props.key = sid;
            // Wrap onsubmit to prevent default form submission (page reload)
            const userOnSubmit = props.onSubmit || props.onsubmit;
            if (userOnSubmit) {
                props.onSubmit = (ev) => {
                    ev.preventDefault();
                    return userOnSubmit(ev);
                };
            } else {
                props.onSubmit = (ev) => ev.preventDefault();
            }
            delete props.onsubmit;
            const children = Array.from(node.childNodes).map((n, i) => this.renderNode(n, sc, sid, `${i}`)).filter(Boolean);
            return this.act.v('form', props, ...children);
        }

        renderUrl(node, scope, parentSid, seg) {
            const sid = makeSid(parentSid, `URL${seg}`);
            const include = (node.getAttribute('include') || '').split(',').map(s => s.trim()).filter(Boolean);
            const includeTransient = (node.getAttribute('includeTransient') || '').split(',').map(s => s.trim()).filter(Boolean);
            const children = Array.from(node.childNodes).map((n, i) => this.renderNode(n, scope, sid, `${i}`)).filter(Boolean);
            // Data attributes go on the rendered div so syncStateToUrl can find them
            return this.act.v('div', {
                key: sid,
                'data-url-include': JSON.stringify(include),
                'data-url-includeTransient': JSON.stringify(includeTransient)
            }, ...children);
        }

        setupUrlSync() {
            const parseHash = () => {
                const hash = window.location.hash.slice(1);
                if (!hash) return {};
                try {
                    const parts = hash.split('#').filter(Boolean);
                    const combined = {};
                    for (const part of parts) {
                        if (!part) continue;
                        if (part.startsWith('{') || part.startsWith('%7B')) {
                            Object.assign(combined, JSON.parse(decodeURIComponent(part)));
                        } else {
                            const params = new URLSearchParams(part);
                            for (const [k, v] of params.entries()) {
                                combined[k] = v;
                            }
                        }
                    }
                    return combined;
                } catch (e) {
                    console.warn('URL parse failed', e);
                    return {};
                }
            };
            const syncFromUrl = () => {
                const state = parseHash();
                Object.assign(this.namespaces.url, state);
            };
            window.addEventListener('hashchange', syncFromUrl);
            syncFromUrl();
            // Subscribe to URL namespace changes to sync back to browser hash
            this.act.subscribe(() => this.syncStateToUrl(), 'url');
        }

        syncStateToUrl() {
            const includeSet = new Set();
            document.querySelectorAll('[data-url-include]').forEach(el => {
                try { JSON.parse(el.getAttribute('data-url-include')).forEach(k => includeSet.add(k)); } catch {}
            });
            const transientSet = new Set();
            document.querySelectorAll('[data-url-includeTransient]').forEach(el => {
                try { JSON.parse(el.getAttribute('data-url-includeTransient')).forEach(k => transientSet.add(k)); } catch {}
            });
            const urlState = this.namespaces.url;
            const persistent = {};
            const transient = {};
            includeSet.forEach(k => { if (urlState[k] != null) persistent[k] = urlState[k]; });
            transientSet.forEach(k => { if (urlState[k] != null) transient[k] = urlState[k]; });
            const serialize = obj => {
                const keys = Object.keys(obj);
                if (!keys.length) return '';
                const complex = Object.values(obj).some(v => typeof v === 'object');
                if (complex) {
                    const sorted = {};
                    keys.sort().forEach(k => sorted[k] = obj[k]);
                    return encodeURIComponent(JSON.stringify(sorted));
                }
                const params = new URLSearchParams();
                keys.sort().forEach(k => params.set(k, obj[k]));
                return params.toString();
            };
            const frag1 = serialize(persistent);
            const frag2 = serialize(transient);
            const parts = [];
            if (frag1) parts.push(frag1);
            if (frag2) parts.push(frag2);
            const hash = parts.length ? '#' + parts.join('#') : '#';
            if (window.location.hash !== hash) {
                window.history.replaceState(null, '', hash);
            }
        }

        ready(fn) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', fn);
            } else {
                fn();
            }
        }
    }

    // ---- Initialize and Export ----

    // ActDown-ext-forms auto-applies when loaded, so no explicit call needed

    const runtime = new TagMarkRuntime();

    // Bootstrap on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => runtime.bootstrap());
    } else {
        runtime.bootstrap();
    }

    global.TagMark = runtime;

    // Expose debug interface for console access: TagMarkDebug.enableTrace('render')
    global.TagMarkDebug = {
        enableTrace,
        disableTrace,
        traceEnabled,
        Handle,
        createScope: (parent) => new Scope(parent),
        getExprCacheStats: () => runtime.getExprCacheStats(),
        resetExprCache: () => runtime.resetExprCache(),
    };

})(typeof window !== 'undefined' ? window : this);
