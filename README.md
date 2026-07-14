# MarkEdit Rendered Math

MathJax previews for inline and display math in [MarkEdit](https://github.com/MarkEdit-app/MarkEdit).

## Installation

Copy both JavaScript files into MarkEdit's `scripts` directory and restart MarkEdit.

## Usage

Inline math uses `$...$`. Display math uses `$$...$$`, including multiline blocks. The source is revealed when the cursor enters the expression.

Edit `markedit-rendered-math-settings.js` to add MathJax macros under `shared.mathJax.tex.macros`, then restart MarkEdit.

Requires MarkEdit's JavaScript extension API. MathJax is loaded from jsDelivr.
