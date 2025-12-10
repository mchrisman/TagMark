// TagMark SES wrapper: installs a Compartment-based expression strategy.
(function (global) {
    function requireSesGlobals() {
        if (typeof lockdown !== 'function') {
            throw new Error('SES not detected: load ses.umd.min.js before tagmark-ses-wrapper.js');
        }
        if (typeof Compartment !== 'function') {
            throw new Error('SES Compartment is unavailable: load ses.umd.min.js before tagmark-ses-wrapper.js');
        }
    }

    function makeSesStrategy(endowments = {}) {
        requireSesGlobals();
        lockdown();
        const compartment = new Compartment(endowments);
        return {
            makeFunction(params, body) {
                const argsList = params.join(', ');
                const source = `
                    (function(${argsList}) {
                        "use strict";
                        return (${body});
                    })
                `;
                return compartment.evaluate(source);
            },
        };
    }

    function installSesStrategy(options = {}) {
        const { endowments = {}, tagmark = global.TagMarkDebug } = options;
        if (!tagmark || typeof tagmark.setExpressionStrategy !== 'function') {
            throw new Error('TagMarkDebug.setExpressionStrategy is required to install the SES strategy');
        }
        const strategy = makeSesStrategy(endowments);
        tagmark.setExpressionStrategy(strategy);
        return strategy;
    }

    global.TagMarkSES = { makeStrategy: makeSesStrategy, install: installSesStrategy };
})(typeof window !== 'undefined' ? window : globalThis);
