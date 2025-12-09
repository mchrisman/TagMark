/*
ActDown Forms Extension - React-like controlled inputs with cursor preservation and managed components

## Basic controlled input with state binding
ActDown.v('input', {value: $local.name, oninput: e => $local.name = e.target.value})

## Managed components with internal state
ActDown.v("StatefulManagedInput", {id: "username", initial: "john", placeholder: "Enter name"})
ActDown.v("StatefulManagedTextarea", {id: "bio", initial: "Tell us about yourself", rows: "4"})
ActDown.v("StatefulManagedSelect", {id: "country", initial: "us"}, 
  ActDown.v("option", {value: "us"}, "United States"),
  ActDown.v("option", {value: "ca"}, "Canada"))
ActDown.v("StatefulManagedCheckbox", {id: "agree", initial: false, value: "terms"}, "I agree to terms")
ActDown.v("StatefulManagedRadio", {id: "color", initial: "red", name: "color", value: "red"}, "Red")

## Managed components with external state injection
ActDown.v("ManagedInput", {getValue: () => $local.email, setValue: v => $local.email = v, type: "email"})
ActDown.v("ManagedTextarea", {getValue: () => $local.bio, setValue: v => $local.bio = v, rows: "6"})
ActDown.v("ManagedSelect", {getValue: () => $local.country, setValue: v => $local.country = v}, 
  ActDown.v("option", {value: "us"}, "United States"))
ActDown.v("ManagedCheckbox", {getValue: () => $local.agree, setValue: v => $local.agree = v, value: "terms"}, "I agree")
ActDown.v("ManagedRadio", {getValue: () => $local.color, setValue: v => $local.color = v, name: "color", value: "blue"}, "Blue")
ActDown.v("ManagedLogKnob", {getValue: () => $local.gain, setValue: v => $local.gain = v, k: 1, size: 120})

## Logarithmic knob controls
ActDown.v("StatefulManagedLogKnob", {initial: 100, k: 1, size: 120}) // Internal state
ActDown.v("ManagedLogKnob", {getValue: () => $local.value, setValue: v => $local.value = v, k: 1, size: 120}) // External state
// Display shows 10*log10(value-k), each rotation changes display by 10
// Left button resets, right button opens value editor, drag to rotate

## Cursor preservation - typing won't jump cursor when state updates
// Automatically handles focus state, selection range, and user edit detection
// Detects user edits vs programmatic updates and preserves cursor position

## Unmanaged forms (core ActDown behavior)
ActDown.v('input', {$unmanaged: true, defaultValue: "initial"}) // No controlled behavior

## More
- Core ActDown protects form identity but doesn't manage values
- This extension adds full React-like controlled input behavior
- Handles value/checked/selected props with intelligent cursor preservation
- Provides both stateful (internal state) and managed (external state) component variants
- Special handling for select elements with automatic fallback to valid options
- Load after ActDown. Auto-applies when included, no setup required
*/
;(function (root, factory) {
	// Check if already loaded
	if (root.ActDownExtForms && root.ActDownExtForms.__loaded) {
		return;
	}
	
	if (typeof define === 'function' && define.amd) {
		// AMD - require ActDown as dependency
		define(['./ActDown'], factory);
	} else if (typeof module === 'object' && module.exports) {
		// CommonJS
		module.exports = factory(require('./ActDown'));
	} else {
		// Browser globals
		root.ActDownExtForms = factory(root.ActDown);
	}
}(typeof self !== 'undefined' ? self : this, function (ActDown) {

function formExtension(actdown) {
	const {v, _internal} = actdown;
	// Internals we need:
	//   intern.impl         - implementation instance to override methods on
	//   intern.BOOL         - Set of boolean attributes
	const impl = _internal;
	const originalUpdateProps = impl.updateProps.bind(impl);
	const BOOL_PROPS = _internal.BOOL;
	const FORM_ELEMENTS = _internal.FORM_ELEMENTS;
	const USER_DATA_PROPS = _internal.USER_DATA_PROPS;

	// Override updateProps to handle form controls specially
	impl.updateProps = function (el, oldProps = {}, newProps = {}, blacklist = new Set()) {
		const tag = el.tagName.toLowerCase();

		if (FORM_ELEMENTS.has(tag)) {
			// Check if this element is marked as unmanaged
			if (newProps.$unmanaged) {
				// For unmanaged elements, defer to core (which skips user data props)
				return originalUpdateProps(el, oldProps, newProps, blacklist);
			}
			// Remove any props that disappeared (except user data props)
			for (const k in oldProps) {
				if (USER_DATA_PROPS.has(k)) continue;
				if (blacklist.has(k)) continue;
				if (!(k in newProps)) {
					if (k.startsWith('on')) {
						const ev = k.slice(2).toLowerCase();
						el.removeEventListener(ev, oldProps[k]);
					} else if (BOOL_PROPS.has(k)) {
						el[k] = false;
						el.removeAttribute(k);
					} else {
						el.removeAttribute(k);
					}
				}
			}

			// Add/update non-user-data props
			for (const k in newProps) {
				if (USER_DATA_PROPS.has(k)) continue;
				if (blacklist.has(k)) continue;
				const v = newProps[k];
				if (v !== oldProps[k]) {
					if (k.startsWith('on')) {
						const ev = k.slice(2).toLowerCase();
						if (oldProps[k]) {
							el.removeEventListener(ev, oldProps[k]);
						}
						el.addEventListener(ev, v);
					} else if (BOOL_PROPS.has(k)) {
						el[k] = !!v;
						if (v) {
							el.setAttribute(k, '');
						} else {
							el.removeAttribute(k);
						}
					} else if (k !== '$localStateNamespace') {
						el.setAttribute(k, v);
					}
				}
			}

			// Handle "value" with cursor preservation
			if ('value' in newProps && newProps.value !== oldProps.value) {
				const isActive = (el === document.activeElement);

				if (!isActive) {
					// Not focused → safe to replace
					el.value = newProps.value;
				} else if (el.value === oldProps.value) {
					// Focused but no user edit → preserve cursor
					const start = el.selectionStart;
					const end = el.selectionEnd;
					const dir = el.selectionDirection;

					el.value = newProps.value;

					const newLen = String(newProps.value).length;
					const newStart = Math.min(start, newLen);
					const newEnd = Math.min(end, newLen);
					try {
						el.setSelectionRange(newStart, newEnd, dir);
					} catch (err) {
						// Some input types don’t support selection
					}
				} else {
					// User edited → don’t overwrite
					if (newProps.onchange) {
						newProps.onchange({target: el});
					}
				}
			}

			// Handle "checked" property
			if ('checked' in newProps && newProps.checked !== oldProps.checked) {
				const boolValue = !!newProps.checked;
				if (el.checked !== boolValue) {
					el.checked = boolValue;
					if (boolValue) {
						el.setAttribute('checked', '');
					} else {
						el.removeAttribute('checked');
					}
				}
			}

			// Handle "selected" property
			if ('selected' in newProps && newProps.selected !== oldProps.selected) {
				const boolValue = !!newProps.selected;
				if (el.selected !== boolValue) {
					el.selected = boolValue;
					if (boolValue) {
						el.setAttribute('selected', '');
					} else {
						el.removeAttribute('selected');
					}
				}
			}

			// Special handling for <select>
			if (tag === 'select' && 'value' in newProps) {
				// If options aren't ready yet, defer the value setting
				if (el.options.length === 0) {
					// Schedule a microtask to set the value after options are rendered
					Promise.resolve().then(() => {
						const hasOpt = Array.from(el.options).some(opt =>
							opt.value === newProps.value && !opt.disabled
						);

						if (hasOpt) {
							el.value = newProps.value;
						} else {
							// Optionally fall back to first valid option
							const firstValid = Array.from(el.options).find(opt => !opt.disabled);
							if (firstValid) {
								el.value = firstValid.value;
							}
						}
					});
				} else {
					// Options are available, proceed normally
					const hasOpt = Array.from(el.options).some(opt =>
						opt.value === newProps.value && !opt.disabled
					);

					if (hasOpt) {
						el.value = newProps.value;
					} else if (el.options.length > 0) {
						// Fallback to first non-disabled
						const firstValid = Array.from(el.options).find(opt => !opt.disabled);
						if (firstValid) {
							el.value = firstValid.value;
						}
					}
				}
			}
		} else {
			// Not a form control → defer to original
			originalUpdateProps(el, oldProps, newProps, blacklist);
		}
	};

	/**
	 * StatefulManagedInput - Input with internal state management
	 * Usage: ActDown.v("StatefulManagedInput", {id: "username", initial: "john", placeholder: "Enter name"})
	 */
	ActDown.def("StatefulManagedInput", ({props}) => {
		const $local = ActDown.stateForId(props.id, () => ({value: props.initial || ''}));
		const {initial, onchange, ...rest} = props;  
		return ActDown.v('input', {
			...rest,                                 // Pass through other properties, e.g. disabled, style. 
			value: $local.value,                     
			oninput: e => {                          // Lambda captures are exempt from V-Node diffing. Otherwise, this would be a problem 
				$local.value = e.target.value;       // Adapt the `onChange` handler that was given us and propagate value changes to state changes
				if (onchange) onchange(e);
			}
		});
	});
	
	/**
	 * ManagedInput - Input with external state injection
	 * Usage: ActDown.v("ManagedInput", {getValue: () => $local.email, setValue: v => $local.email = v, type: "email"})
	 */
	ActDown.def("ManagedInput", ({props}) => {
		const {getValue, setValue, onchange, ...rest} = props;
		return ActDown.v('input', {
			...rest,
			value: getValue() || '',
			oninput: e => {
				setValue(e.target.value);
				if (onchange) onchange(e);
			}
		});
	});

	/**
	 * StatefulManagedTextarea - Textarea with internal state management
	 * Usage: ActDown.v("StatefulManagedTextarea", {id: "bio", initial: "Tell us about yourself", rows: "4"})
	 */
	ActDown.def("StatefulManagedTextarea", ({props}) => {
		const $local = ActDown.stateForId(props.id, () => ({value: props.initial || ''}));
		const {initial, onchange, ...rest} = props;
		return ActDown.v('textarea', {
			...rest,
			value: $local.value,
			oninput: e => {
				$local.value = e.target.value;
				if (onchange) onchange(e);
			}
		});
	});
	
	/**
	 * ManagedTextarea - Textarea with external state injection
	 * Usage: ActDown.v("ManagedTextarea", {getValue: () => $local.bio, setValue: v => $local.bio = v, rows: "6"})
	 */
	ActDown.def("ManagedTextarea", ({props}) => {
		const {getValue, setValue, onchange, claxx, ...rest} = props;
		return ActDown.v('textarea', {
			...rest,class:claxx||undefined,
			value: getValue() || '',
			oninput: e => {
				setValue(e.target.value);
				if (onchange) onchange(e);
			}
		});
	});

	/**
	 * StatefulManagedSelect - Select with internal state management
	 * Usage: ActDown.v("StatefulManagedSelect", {id: "country", initial: "us"}, 
	 *          ActDown.v("option", {value: "us"}, "United States"),
	 *          ActDown.v("option", {value: "ca"}, "Canada"))
	 */
	ActDown.def("StatefulManagedSelect", ({props, children}) => {
		const $local = ActDown.stateForId(props.id, () => ({value: props.initial || ''}));
		const {initial, onchange, ...rest} = props;
		return ActDown.v('select', {
			...rest,
			value: $local.value,
			onchange: e => {
				$local.value = e.target.value;
				if (onchange) onchange(e);
			}
		}, children);
	});
	
	/**
	 * ManagedSelect - Select with external state injection
	 * Usage: ActDown.v("ManagedSelect", {getValue: () => $local.country, setValue: v => $local.country = v},
	 *          ActDown.v("option", {value: "us"}, "United States"))
	 */
	ActDown.def("ManagedSelect", ({props, children}) => {
		const {getValue, setValue, onchange, ...rest} = props;
		return ActDown.v('select', {
			...rest,
			value: getValue() || '',
			onchange: e => {
				setValue(e.target.value);
				if (onchange) onchange(e);
			}
		}, children);
	});

	/**
	 * StatefulManagedCheckbox - Checkbox with internal state management
	 * Usage: ActDown.v("StatefulManagedCheckbox", {id: "agree", initial: false, value: "terms"}, "I agree to terms")
	 */
	ActDown.def("StatefulManagedCheckbox", ({props, children}) => {
		const $local = ActDown.stateForId(props.id, () => ({checked: props.initial || false}));
		const {initial, onchange, ...rest} = props;
		return ActDown.v('label', {},
			ActDown.v('input', {
				type: 'checkbox',
				...rest,
				checked: $local.checked,
				onchange: e => {
					$local.checked = e.target.checked;
					if (onchange) onchange(e);
				}
			}),
			children
		);
	});
	
	/**
	 * ManagedCheckbox - Checkbox with external state injection
	 * Usage: ActDown.v("ManagedCheckbox", {getValue: () => $local.agree, setValue: v => $local.agree = v, value: "terms"}, "I agree")
	 */
	ActDown.def("ManagedCheckbox", ({props, children}) => {
		const {getValue, setValue, onchange, ...rest} = props;
		return ActDown.v('label', {},
			ActDown.v('input', {
				type: 'checkbox',
				...rest,
				checked: getValue() || false,
				onchange: e => {
					setValue(e.target.checked);
					if (onchange) onchange(e);
				}
			}),
			children
		);
	});

	/**
	 * StatefulManagedRadio - Radio button with internal state management
	 * Usage: ActDown.v("StatefulManagedRadio", {id: "color", initial: "red", name: "color", value: "red"}, "Red")
	 */
	ActDown.def("StatefulManagedRadio", ({props, children}) => {
		const $local = ActDown.stateForId(props.id, () => ({value: props.initial || ''}));
		const {initial, onchange, value, ...rest} = props;
		return ActDown.v('label', {},
			ActDown.v('input', {
				type: 'radio',
				...rest,
				value: value,
				checked: $local.value === value,
				onchange: e => {
					if (e.target.checked) {
						$local.value = value;
						if (onchange) onchange(e);
					}
				}
			}),
			children
		);
	});
	
	/**
	 * ManagedRadio - Radio button with external state injection
	 * Usage: ActDown.v("ManagedRadio", {getValue: () => $local.color, setValue: v => $local.color = v, name: "color", value: "blue"}, "Blue")
	 */
	ActDown.def("ManagedRadio", ({props, children}) => {
		const {getValue, setValue, onchange, value, ...rest} = props;
		return ActDown.v('label', {},
			ActDown.v('input', {
				type: 'radio',
				...rest,
				value: value,
				checked: getValue() === value,
				onchange: e => {
					if (e.target.checked) {
						setValue(value);
						if (onchange) onchange(e);
					}
				}
			}),
			children
		);
	});

}

// Apply the extension
if (ActDown) {
	formExtension(ActDown);
}

// Return the extension function for manual application if needed
const api = { formExtension, __loaded: true };
return api;

})); // End UMD