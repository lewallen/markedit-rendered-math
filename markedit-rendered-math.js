"use strict";

const { MarkEdit } = require("markedit-api");

const {
    EditorView,
    Decoration,
    ViewPlugin,
    WidgetType
} = MarkEdit.codemirror.view;
const { EditorSelection, StateEffect, StateField } = MarkEdit.codemirror.state;
const { ensureSyntaxTree, syntaxTree } = MarkEdit.codemirror.language;

// Edit this object to add or change MathJax macros for the standalone extension.
const embeddedSettings = {
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

let settings = buildMathPreviewSettings();

let mathJaxPromise;
let loggedMathJaxSettings = false;
const activeMathPreviewViews = new Set();
const refreshMathPreviewEffect = StateEffect.define();
const activeBlockMathPreviewViews = new Set();
const refreshBlockMathPreviewEffect = StateEffect.define();

class MathPreviewWidget extends WidgetType {
    constructor(tex, displayMode, revealPos) {
        super();
        this.tex = tex;
        this.displayMode = displayMode;
        this.revealPos = revealPos;
    }

    eq(other) {
        return (
            this.tex === other.tex &&
            this.displayMode === other.displayMode &&
            this.revealPos === other.revealPos
        );
    }

    toDOM(view) {
        const dom = document.createElement(this.displayMode ? "div" : "span");
        dom.className = this.displayMode
            ? "cm-md-mathPreview cm-md-mathPreview-display"
            : "cm-md-mathPreview";
        dom.textContent = this.tex;
        dom.title = this.displayMode
            ? "$$" + this.tex + "$$"
            : "$" + this.tex + "$";
        dom.setAttribute("aria-label", dom.title);
        refreshMathPreviewSettings();
        if (!this.displayMode && settings.inlineYOffset !== "0em") {
            dom.style.top = settings.inlineYOffset;
        }

        dom.addEventListener("mousedown", event => {
            event.preventDefault();
            event.stopPropagation();
            view.dispatch({
                selection: EditorSelection.cursor(this.revealPos),
                scrollIntoView: true
            });
            view.focus();
        });

        renderMath(dom, this.tex, this.displayMode, view);
        return dom;
    }

    ignoreEvent() {
        return false;
    }
}

class InlineMathPreview {
    constructor(view) {
        this.view = view;
        activeMathPreviewViews.add(view);
        this.decorations = buildDecorations(view);
        this.scheduleStartupRefreshes(view);
    }

    update(update) {
        const isRefresh = hasRefreshEffect(update);
        if (
            update.docChanged ||
            update.viewportChanged ||
            update.selectionSet ||
            isRefresh
        ) {
            this.decorations = buildDecorations(update.view, isRefresh);
        }
    }

    scheduleStartupRefreshes(view) {
        for (const delay of [50, 150, 350, 800, 1600, 3000]) {
            setTimeout(() => refreshMathPreviews(view), delay);
        }
    }

    destroy() {
        activeMathPreviewViews.delete(this.view);
    }
}

class BlockMathPreviewWidget extends WidgetType {
    constructor(tex, revealPos) {
        super();
        this.tex = tex;
        this.revealPos = revealPos;
    }

    eq(other) {
        return this.tex === other.tex && this.revealPos === other.revealPos;
    }

    toDOM(view) {
        const dom = document.createElement("span");
        dom.className = "cm-md-blockMathPreview";
        dom.textContent = this.tex;
        dom.title = "$$\n" + this.tex + "\n$$";
        dom.setAttribute("aria-label", "Rendered block math preview");

        dom.addEventListener("mousedown", event => {
            event.preventDefault();
            event.stopPropagation();
            view.dispatch({
                selection: EditorSelection.cursor(this.revealPos),
                scrollIntoView: true
            });
            view.focus();
        });

        renderMath(dom, this.tex, true, view);
        return dom;
    }

    ignoreEvent() {
        return false;
    }
}

class BlockMathPreviewStartupRefresher {
    constructor(view) {
        this.view = view;
        activeBlockMathPreviewViews.add(view);
        for (const delay of [80, 200, 500, 1000, 2000, 4000]) {
            setTimeout(() => refreshBlockMathPreviews(view), delay);
        }
    }

    destroy() {
        activeBlockMathPreviewViews.delete(this.view);
    }
}

const inlineMathPreviewPlugin = ViewPlugin.fromClass(InlineMathPreview, {
    decorations: plugin => plugin.decorations
});

const blockMathPreviewStartupRefresherPlugin = ViewPlugin.fromClass(
    BlockMathPreviewStartupRefresher
);

const blockMathPreviewField = StateField.define({
    create(state) {
        return buildBlockMathDecorations(state);
    },
    update(_decorations, transaction) {
        return buildBlockMathDecorations(transaction.state);
    },
    provide: field => EditorView.decorations.from(field)
});

const inlineMathPreviewTheme = EditorView.baseTheme({
    ".cm-md-mathPreview": {
        display: "inline",
        position: "relative",
        padding: "0 0.12em",
        color: "inherit",
        cursor: "text",
        verticalAlign: "baseline"
    },
    ".cm-md-mathPreview mjx-container[jax='SVG']": {
        display: "inline-block"
    },
    ".cm-md-mathPreview-display": {
        display: "block",
        padding: "0",
        textAlign: "center",
        fontSize: "1.08em",
        lineHeight: "1",
        verticalAlign: "baseline"
    },
    ".cm-md-mathPreview-error": {
        color: "#b00020",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "0.95em"
    },
    ".cm-md-mathPreview-display mjx-container, .cm-md-mathPreview-display svg": {
        verticalAlign: "middle !important"
    },
    ".cm-md-mathPreview-display mjx-container[display='true']": {
        display: "block !important",
        margin: "0 !important",
        padding: "0 !important"
    },
    ".cm-md-blockMathPreview": {
        display: "block",
        boxSizing: "border-box",
        width: "100%",
        padding: "0",
        textAlign: "center",
        cursor: "text",
        lineHeight: "1.45"
    },
    ".cm-md-blockMathPreview mjx-container, .cm-md-blockMathPreview svg": {
        verticalAlign: "middle !important"
    },
    ".cm-md-blockMathPreview mjx-container[display='true']": {
        margin: "0 !important",
        padding: "0 !important"
    },
    ".cm-md-blockMathPreview.cm-md-mathPreview-error": {
        color: "#b00020",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "0.95em"
    },
    ".cm-md-previewWrapper:has(.cm-md-previewButton[data-type='katex'])": {
        display: "none"
    }
});

MarkEdit.addExtension([
    inlineMathPreviewTheme,
    inlineMathPreviewPlugin,
    blockMathPreviewField,
    blockMathPreviewStartupRefresherPlugin
]);
MarkEdit.onEditorReady(view => {
    for (const delay of [100, 500, 1200, 2500]) {
        setTimeout(() => refreshMathPreviews(view), delay);
        setTimeout(() => refreshBlockMathPreviews(view), delay);
    }
});

function hasRefreshEffect(update) {
    return update.transactions.some(transaction =>
        transaction.effects.some(effect => effect.is(refreshMathPreviewEffect))
    );
}

function refreshMathPreviews(view) {
    if (view && typeof view.dispatch === "function") {
        view.dispatch({ effects: refreshMathPreviewEffect.of(null) });
    }
}

function refreshAllMathPreviews() {
    for (const view of activeMathPreviewViews) {
        refreshMathPreviews(view);
    }
}

function refreshBlockMathPreviews(view) {
    if (view && typeof view.dispatch === "function") {
        view.dispatch({ effects: refreshBlockMathPreviewEffect.of(null) });
    }
}

function refreshAllBlockMathPreviews() {
    for (const view of activeBlockMathPreviewViews) {
        refreshBlockMathPreviews(view);
    }
}

function buildDecorations(view, fullScan = false) {
    const widgets = [];
    const ranges = fullScan
        ? [{ from: 0, to: view.state.doc.length }]
        : view.visibleRanges;
    const tree = getSyntaxTree(view.state, ranges);

    for (const range of ranges) {
        const fromLine = view.state.doc.lineAt(range.from);
        const toLine = view.state.doc.lineAt(range.to);

        for (
            let lineNumber = fromLine.number;
            lineNumber <= toLine.number;
            lineNumber++
        ) {
            const line = view.state.doc.line(lineNumber);
            for (const match of findMathRanges(line.text, line.from)) {
                if (match.to < range.from || match.from > range.to) {
                    continue;
                }

                if (
                    selectionTouchesMath(view.state.selection, match) ||
                    isInsideIgnoredMarkdown(tree, match.from, match.to)
                ) {
                    continue;
                }

                const deco = Decoration.replace({
                    widget: new MathPreviewWidget(
                        match.tex,
                        match.displayMode,
                        match.contentFrom
                    )
                });
                widgets.push(deco.range(match.from, match.to));
            }
        }
    }

    return Decoration.set(widgets.sort((a, b) => a.from - b.from));
}

function buildBlockMathDecorations(state) {
    const widgets = [];
    const tree = getSyntaxTree(state, [{ from: 0, to: state.doc.length }]);

    tree.iterate({
        enter: node => {
            if (node.name !== "BlockMath") {
                return;
            }

            const match = blockMathRange(state, node.from, node.to);
            if (
                !match ||
                !match.isMultiline ||
                selectionTouchesMath(state.selection, match)
            ) {
                return;
            }

            widgets.push(
                Decoration.replace({
                    widget: new BlockMathPreviewWidget(
                        match.tex,
                        match.contentFrom
                    ),
                    inclusive: false
                }).range(match.from, match.to)
            );
        }
    });

    return Decoration.set(widgets.sort((a, b) => a.from - b.from));
}

function blockMathRange(state, from, to) {
    const source = state.sliceDoc(from, to);
    const opening = source.indexOf("$$");
    const closing = source.lastIndexOf("$$");

    if (opening === -1 || closing <= opening) {
        return null;
    }

    const tex = source.slice(opening + 2, closing).trim();
    if (tex.length === 0) {
        return null;
    }

    return {
        from,
        to,
        contentFrom: from + opening + 2,
        tex,
        isMultiline: source.includes("\n")
    };
}

function getSyntaxTree(state, ranges) {
    const upto = ranges.reduce((max, range) => Math.max(max, range.to), 1);
    if (typeof ensureSyntaxTree === "function" && state.doc.length < 102400) {
        return ensureSyntaxTree(state, upto) || syntaxTree(state);
    }

    return syntaxTree(state);
}

function findMathRanges(text, lineFrom) {
    const ranges = [];
    let index = 0;

    while (index < text.length) {
        if (text[index] !== "$" || isEscaped(text, index)) {
            index++;
            continue;
        }

        const delimiter = text[index + 1] === "$" ? "$$" : "$";
        const openLength = delimiter.length;
        const contentStart = index + openLength;

        if (!isValidOpening(text, index, contentStart)) {
            index += openLength;
            continue;
        }

        const close = findClosingDelimiter(text, delimiter, contentStart);
        if (close === -1) {
            index += openLength;
            continue;
        }

        const contentEnd = close;
        if (contentEnd > contentStart && isValidClosing(text, close)) {
            ranges.push({
                from: lineFrom + index,
                to: lineFrom + close + openLength,
                contentFrom: lineFrom + contentStart,
                tex: text.slice(contentStart, contentEnd),
                displayMode: delimiter === "$$"
            });
        }

        index = close + openLength;
    }

    return ranges;
}

function findClosingDelimiter(text, delimiter, from) {
    for (let index = from; index < text.length; index++) {
        if (text.startsWith(delimiter, index) && !isEscaped(text, index)) {
            return index;
        }
    }

    return -1;
}

function isEscaped(text, index) {
    let slashCount = 0;
    for (
        let cursor = index - 1;
        cursor >= 0 && text[cursor] === "\\";
        cursor--
    ) {
        slashCount++;
    }

    return slashCount % 2 === 1;
}

function isValidOpening(text, delimiterStart, contentStart) {
    const before = delimiterStart > 0 ? text[delimiterStart - 1] : "";
    const first = text[contentStart] || "";

    return first !== "" && !/\s/.test(first) && before !== "$";
}

function isValidClosing(text, delimiterStart) {
    const before = delimiterStart > 0 ? text[delimiterStart - 1] : "";
    const after =
        text[delimiterStart + 1] === "$"
            ? text[delimiterStart + 2] || ""
            : text[delimiterStart + 1] || "";

    return before !== "" && !/\s/.test(before) && after !== "$";
}

function selectionTouchesMath(selection, match) {
    return selection.ranges.some(range => {
        if (range.empty) {
            return range.from >= match.from && range.from <= match.to;
        }

        return range.from <= match.to && range.to >= match.from;
    });
}

function isInsideIgnoredMarkdown(tree, from, to) {
    return (
        hasIgnoredAncestor(tree.resolveInner(from, 1)) ||
        hasIgnoredAncestor(tree.resolveInner(to, -1))
    );
}

function hasIgnoredAncestor(node) {
    for (let cursor = node; cursor; cursor = cursor.parent) {
        if (
            [
                "InlineCode",
                "FencedCode",
                "CodeBlock",
                "CodeInfo",
                "Link",
                "URL",
                "Image"
            ].includes(cursor.name)
        ) {
            return true;
        }
    }

    return false;
}

async function renderMath(dom, tex, displayMode, view) {
    try {
        const MathJax = await loadMathJax();
        if (!dom.isConnected) {
            refreshMathPreviews(view);
            refreshBlockMathPreviews(view);
            return;
        }

        const rendered = MathJax.tex2svg(mathSource(tex, displayMode), {
            display: displayMode
        });
        normalizeMathOutput(rendered, displayMode);
        dom.replaceChildren(rendered);
        if (view && typeof view.requestMeasure === "function") {
            requestAnimationFrame(() => view.requestMeasure());
        }
    } catch (error) {
        dom.classList.add("cm-md-mathPreview-error");
        dom.textContent = tex;
        console.error("Inline math preview failed:", error);
    }
}

function normalizeMathOutput(rendered, displayMode) {
    const container = rendered.matches?.("mjx-container")
        ? rendered
        : rendered.querySelector("mjx-container");
    if (container) {
        container.style.display = displayMode ? "block" : "inline";
        container.style.margin = "0";
        container.style.padding = "0";
    }

    const svg = rendered.querySelector("svg");
    if (svg) {
        svg.style.overflow = "visible";
    }
}

function mathSource(tex, displayMode) {
    if (displayMode || !settings.inlineStrut) {
        return tex;
    }

    return settings.inlineStrut + tex;
}

function loadMathJax() {
    refreshMathPreviewSettings();
    if (window.MathJax && typeof window.MathJax.tex2svg === "function") {
        return Promise.resolve(window.MathJax);
    }

    if (mathJaxPromise) {
        return mathJaxPromise;
    }

    if (globalThis.MarkEditMathPreviewMathJaxPromise) {
        mathJaxPromise = globalThis.MarkEditMathPreviewMathJaxPromise.then(
            MathJax => {
                setTimeout(refreshAllMathPreviews, 0);
                setTimeout(refreshAllBlockMathPreviews, 0);
                return MathJax;
            }
        );
        return mathJaxPromise;
    }

    mathJaxPromise = new Promise((resolve, reject) => {
        const mathJaxConfig = mergeSettings(
            {
                tex: {
                    inlineMath: [["$", "$"]],
                    displayMath: [["$$", "$$"]],
                    processEscapes: true
                },
                svg: {
                    fontCache: "none"
                }
            },
            settings.mathJax || {}
        );
        logMathJaxSettings("inline");

        mathJaxConfig.startup = {
            ...(mathJaxConfig.startup || {}),
            ready() {
                window.MathJax.startup.defaultReady();
                resolve(window.MathJax);
                setTimeout(refreshAllMathPreviews, 0);
                setTimeout(refreshAllMathPreviews, 80);
                setTimeout(refreshAllMathPreviews, 250);
                setTimeout(refreshAllBlockMathPreviews, 0);
                setTimeout(refreshAllBlockMathPreviews, 80);
                setTimeout(refreshAllBlockMathPreviews, 250);
            }
        };

        window.MathJax = mathJaxConfig;

        const script = document.createElement("script");
        script.src = settings.mathJaxUrl;
        script.async = true;
        script.addEventListener("error", () =>
            reject(
                new Error("Could not load MathJax from " + settings.mathJaxUrl)
            )
        );
        document.head.appendChild(script);
    });
    globalThis.MarkEditMathPreviewMathJaxPromise = mathJaxPromise;

    return mathJaxPromise;
}

function buildMathPreviewSettings() {
    const preferences = globalThis.MarkEditMathPreviewSettings || {};
    return mergeSettings(
        {
            mathJax: {},
            mathJaxUrl: "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js",
            inlineYOffset: "0em",
            inlineStrut: "\\vphantom{(gjpqy}"
        },
        sharedPreferences(embeddedSettings),
        embeddedSettings.inlineMathPreview || {},
        embeddedSettings.blockMathPreviewExperiment || {},
        sharedPreferences(preferences),
        preferences.inlineMathPreview || {},
        preferences.blockMathPreviewExperiment || {},
        (MarkEdit.userSettings || {})["extension.inlineMathPreview"] || {},
        (MarkEdit.userSettings || {})["extension.blockMathPreviewExperiment"] ||
            {}
    );
}

function refreshMathPreviewSettings() {
    settings = buildMathPreviewSettings();
}

function logMathJaxSettings(source) {
    if (loggedMathJaxSettings) {
        return;
    }
    loggedMathJaxSettings = true;

    const macros = settings.mathJax?.tex?.macros || {};
    console.info(
        "MarkEdit math preview configured MathJax from",
        source,
        "script with",
        Object.keys(macros).length,
        "macros"
    );
}

function sharedPreferences(preferences) {
    return mergeSettings(
        {},
        preferences.shared || {},
        pickDefined({
            mathJaxUrl: preferences.mathJaxUrl,
            mathJax: preferences.mathJax
        })
    );
}

function pickDefined(object) {
    const picked = {};
    for (const [key, value] of Object.entries(object)) {
        if (value !== undefined) {
            picked[key] = value;
        }
    }
    return picked;
}

function mergeSettings(...objects) {
    const result = {};
    for (const object of objects) {
        mergeInto(result, object || {});
    }
    return result;
}

function mergeInto(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (isPlainObject(value) && isPlainObject(target[key])) {
            mergeInto(target[key], value);
        } else if (isPlainObject(value)) {
            target[key] = mergeSettings(value);
        } else {
            target[key] = value;
        }
    }
    return target;
}

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
}
