// Unit tests for CaseInsensitiveFunction

const HANDLE_PREFIX = '$H$';

function transformHandles(expr) {
    return expr.replace(/@([A-Za-z_]\w*)/g, (_, name) => `${HANDLE_PREFIX}${name}`);
}

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

// Test runner
let passed = 0, failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`✗ ${name}: ${e.message}`);
        failed++;
    }
}

function eq(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

// Tests

test('simple $variable', () => {
    const cif = new CaseInsensitiveFunction('$foo + 1');
    eq(cif.evaluate({ '$foo': 10 }), 11);
});

test('$variable case mismatch - env has $FOO, expr has $foo', () => {
    const cif = new CaseInsensitiveFunction('$foo + 1');
    eq(cif.evaluate({ '$FOO': 10 }), 11);
});

test('$variable case mismatch - env has $foo, expr has $Foo', () => {
    const cif = new CaseInsensitiveFunction('$Foo + 1');
    eq(cif.evaluate({ '$foo': 10 }), 11);
});

test('handle via $H$ prefix', () => {
    const expr = transformHandles('@Global.value');  // becomes $H$Global.value
    const cif = new CaseInsensitiveFunction(expr);
    eq(cif.evaluate({ '$H$Global': { value: 42 } }), 42);
});

test('handle case mismatch - env has $H$GLOBAL, expr has @Global', () => {
    const expr = transformHandles('@Global.value');  // becomes $H$Global.value
    const cif = new CaseInsensitiveFunction(expr);
    eq(cif.evaluate({ '$H$GLOBAL': { value: 42 } }), 42);
});

test('handle case mismatch - env has $H$global, expr has @GLOBAL', () => {
    const expr = transformHandles('@GLOBAL.value');  // becomes $H$GLOBAL.value
    const cif = new CaseInsensitiveFunction(expr);
    eq(cif.evaluate({ '$H$global': { value: 42 } }), 42);
});

test('mixed variables and handles', () => {
    const expr = transformHandles('$name + @Counter.count');  // becomes $name + $H$Counter.count
    const cif = new CaseInsensitiveFunction(expr);
    eq(cif.evaluate({ '$name': 'x', '$H$Counter': { count: 5 } }), 'x5');
});

test('case-sensitive JS globals still work', () => {
    const cif = new CaseInsensitiveFunction('Math.max($a, $b)');
    eq(cif.evaluate({ '$a': 3, '$b': 7 }), 7);
});

test('reuse compiled function with different values', () => {
    const cif = new CaseInsensitiveFunction('$x * 2');
    eq(cif.evaluate({ '$x': 5 }), 10);
    eq(cif.evaluate({ '$x': 10 }), 20);
    eq(cif.evaluate({ '$X': 15 }), 30);  // case variant
});

test('conflict detection', () => {
    const cif = new CaseInsensitiveFunction('$foo');
    try {
        cif.evaluate({ '$foo': 1, '$FOO': 2 });
        throw new Error('should have thrown');
    } catch (e) {
        if (!e.message.includes('Conflicting')) throw e;
    }
});

test('no conflict if same value', () => {
    const cif = new CaseInsensitiveFunction('$foo');
    eq(cif.evaluate({ '$foo': 1, '$FOO': 1 }), 1);  // same value, no conflict
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
