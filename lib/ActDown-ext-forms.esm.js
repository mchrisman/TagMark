// ActDown-ext-forms.esm.js - ES Module helper
import './ActDown.esm.js';  // Ensure ActDown is loaded first
import './ActDown-ext-forms.js';    // executes UMD IIFE, sets globalThis.ActDownExtForms
const { formExtension } = globalThis.ActDownExtForms;
export { formExtension };