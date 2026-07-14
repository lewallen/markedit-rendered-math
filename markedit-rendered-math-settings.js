"use strict";

// Preferences for the MarkEdit math preview extensions.
//
// MathJax macros go in `shared.mathJax.tex.macros`. Values use MathJax's
// normal JavaScript configuration format:
//   RR: "\\mathbb{R}"
//   bold: ["\\mathbf{#1}", 1]
//
// After editing this file, restart MarkEdit so MathJax reloads with the new
// configuration.

(function() {
    const settings = {
        shared: {
            mathJaxUrl: "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js",
            mathJax: {
                tex: {
                    macros: {
                        C: "\\mathbb{C}",
                        N: "\\mathbb{N}",
                        Q: "\\mathbb{Q}",
                        R: "\\mathbb{R}",
                        Z: "\\mathbb{Z}"
                    }
                }
            }
        },

        inlineMathPreview: {
            inlineYOffset: "0em",
            inlineStrut: "\\vphantom{(gjpqy}"
        },

        blockMathPreviewExperiment: {
            replaceSourceWhenInactive: true,
            hideSourceWhenInactive: false,
            hidePreviewWhenCursorInside: true,
            hideNativePreviewButton: true
        }
    };

    globalThis.MarkEditMathPreviewSettings = settings;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = settings;
    }

    const macros = settings.shared?.mathJax?.tex?.macros || {};
    console.info(
        "MarkEdit math preview settings loaded:",
        Object.keys(macros).length,
        "MathJax macros"
    );
})();
