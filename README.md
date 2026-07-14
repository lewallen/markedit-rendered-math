# MarkEdit Rendered Math

MathJax previews for inline and display math in [MarkEdit](https://github.com/MarkEdit-app/MarkEdit).

## Installation

Copy `markedit-rendered-math.js` into MarkEdit's `scripts` directory and restart MarkEdit.

## Usage

Inline math uses `$...$`. Display math uses `$$...$$`, including multiline blocks. The source is revealed when the cursor enters the expression.

To add MathJax macros, edit `embeddedSettings.shared.mathJax.tex.macros` near the top of the JavaScript file, then restart MarkEdit.

Requires MarkEdit's JavaScript extension API. MathJax is loaded from jsDelivr.

Developed with the help of OpenAI Codex.
