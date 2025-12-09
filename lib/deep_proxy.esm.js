// deep_proxy.esm.js - ES Module helper
import './deep_proxy.js';    // executes UMD IIFE, sets globalThis.DeepProxy
const { makeProxy, eventBus } = globalThis.DeepProxy;
export { makeProxy, eventBus };