// ActDown.esm.js - ES Module helper
import './deep_proxy.esm.js';  // Ensure DeepProxy is loaded first
import './ActDown.js';    // executes UMD IIFE, sets globalThis.ActDown
export default globalThis.ActDown;
export const { v, vAnon, def, state, stateForId, set, wipeAllState, subscribe, mount, unmount, scheduleRefresh, apply, extend, frag, _internal, eventBus } = globalThis.ActDown;