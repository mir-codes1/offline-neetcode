/* Richer Python highlighting for Monaco: a custom tokenizer ("neetpython") plus dark and light themes.
 *
 * Monaco's built-in Python tokenizer cannot tell a function name, a builtin, `self`, a type hint or a
 * decorator apart from any other identifier. This one can, and it also colours f-string {expressions}.
 * It is registered under its own language id so the lazy-loaded built-in `python` never overrides it.
 */
(function () {
  var done = false;

  var CONTROL = ["if", "elif", "else", "for", "while", "try", "except", "finally", "with", "return", "yield",
    "break", "continue", "pass", "raise", "assert", "import", "from", "as", "del", "global", "nonlocal",
    "async", "await", "match", "case"];
  var DECL = ["def", "class", "lambda"];
  var OPWORD = ["and", "or", "not", "in", "is"];
  var CONSTANTS = ["True", "False", "None", "NotImplemented", "Ellipsis", "__name__", "__file__"];
  var SELFS = ["self", "cls"];
  var BUILTIN_TYPES = ["int", "str", "bool", "float", "list", "dict", "set", "tuple", "bytes", "bytearray",
    "object", "complex", "frozenset", "type", "range", "slice"];
  var BUILTINS = ["abs", "all", "any", "ascii", "bin", "callable", "chr", "dir", "divmod", "enumerate", "eval",
    "exec", "filter", "format", "getattr", "hasattr", "hash", "hex", "id", "input", "isinstance", "issubclass",
    "iter", "len", "map", "max", "min", "next", "oct", "open", "ord", "pow", "print", "repr", "reversed",
    "round", "setattr", "sorted", "sum", "super", "vars", "zip", "bisect", "heappush", "heappop", "heapify"];

  function register(monaco) {
    if (done) return;
    done = true;
    var L = monaco.languages;
    L.register({ id: "neetpython", aliases: ["Python"], extensions: [".py"] });

    L.setLanguageConfiguration("neetpython", {
      comments: { lineComment: "#" },
      brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
      autoClosingPairs: [
        { open: "{", close: "}" }, { open: "[", close: "]" }, { open: "(", close: ")" },
        { open: '"', close: '"', notIn: ["string"] }, { open: "'", close: "'", notIn: ["string", "comment"] }
      ],
      surroundingPairs: [
        { open: "{", close: "}" }, { open: "[", close: "]" }, { open: "(", close: ")" },
        { open: '"', close: '"' }, { open: "'", close: "'" }
      ],
      onEnterRules: [{
        beforeText: /^\s*(?:def|class|for|if|elif|else|while|try|with|finally|except|async|match|case)\b.*?:\s*(?:#.*)?$/,
        action: { indentAction: L.IndentAction.Indent }
      }],
      folding: { offSide: true }
    });

    var expr = [
      [/#.*$/, "comment"],
      [/\s+/, "white"],
      [/0[xX][0-9a-fA-F_]+/, "number.hex"],
      [/0[bB][01_]+/, "number.binary"],
      [/0[oO][0-7_]+/, "number.octal"],
      [/(?:\d[\d_]*)?\.\d[\d_]*(?:[eE][+-]?\d+)?j?/, "number.float"],
      [/\d[\d_]*[eE][+-]?\d+j?/, "number.float"],
      [/\d[\d_]*j?/, "number"],
      [/(\.)(\s*)([A-Za-z_]\w*)(?=\s*\()/, ["delimiter", "white", "entity.function.call"]],
      [/(\.)(\s*)([A-Za-z_]\w*)/, ["delimiter", "white", "variable.property"]],
      [/[A-Za-z_]\w*(?=\s*\()/, { cases: {
        "@declKw": "keyword.declaration", "@opKw": "keyword.operator", "@controlKw": "keyword.control",
        "@builtinTypes": "support.type", "@builtins": "support.function.builtin",
        "~[A-Z]\\w*": "type.identifier", "@default": "entity.function.call" } }],
      [/[A-Za-z_]\w*/, { cases: {
        "@constants": "constant.language", "@selfs": "variable.language",
        "@declKw": "keyword.declaration", "@opKw": "keyword.operator", "@controlKw": "keyword.control",
        "@builtinTypes": "support.type", "@builtins": "support.function.builtin",
        "~[A-Z][A-Z0-9_]+": "constant.name", "~[A-Z]\\w*": "type.identifier", "@default": "identifier" } }],
      [/->|\*\*=?|\/\/=?|<<=?|>>=?|[<>=!]=|:=|[-+*\/%&|^~<>=]=?/, "operator"],
      [/[{}()\[\]]/, "@brackets"],
      [/[,;:.@]/, "delimiter"]
    ];

    // plain and f-string bodies share the same shape; only the closing quote and {interpolation} differ
    function body(quote, isF, triple) {
      var close = triple ? new RegExp(quote + quote + quote) : new RegExp(quote);
      var chars = new RegExp("[^\\\\" + quote + (isF ? "{}" : "") + "]+");
      var rules = [];
      if (isF) {
        rules.push([/\{\{|\}\}/, "string"]);
        rules.push([/\{/, { token: "string.interpolation", next: "@interp" }]);
      }
      rules.push([/\\(?:x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[0-7]{1,3}|.)/, "string.escape"]);
      if (!triple) rules.push([new RegExp("[^\\\\" + quote + (isF ? "{}" : "") + "]+$"), { token: "string", next: "@pop" }]);
      rules.push([chars, "string"]);
      rules.push([close, { token: "string", next: "@pop" }]);
      rules.push([new RegExp(quote), "string"]);   // lone quote inside a triple-quoted string
      if (isF) rules.push([/[{}]/, "string"]);
      return rules;
    }

    var P = "(?:[rRbBuU]|[bB][rR]|[rR][bB])?", F = "(?:[fF][rR]?|[rR][fF])";
    function start(prefix, quote, triple, state) {
      var q = triple ? quote + quote + quote : quote;
      return [new RegExp(prefix + q), { token: "string", next: "@" + state }];
    }

    L.setMonarchTokensProvider("neetpython", {
      defaultToken: "",
      tokenPostfix: ".py",
      brackets: [
        { open: "{", close: "}", token: "delimiter.curly" },
        { open: "[", close: "]", token: "delimiter.square" },
        { open: "(", close: ")", token: "delimiter.parenthesis" }
      ],
      controlKw: CONTROL, declKw: DECL, opKw: OPWORD, constants: CONSTANTS, selfs: SELFS,
      builtinTypes: BUILTIN_TYPES, builtins: BUILTINS,
      tokenizer: {
        root: [
          [/^(\s*)(@)([\w.]+)/, ["white", "delimiter", "annotation"]],
          [/\b(def)(\s+)([A-Za-z_]\w*)/, ["keyword.declaration", "white", "entity.name.function"]],
          [/\b(class)(\s+)([A-Za-z_]\w*)/, ["keyword.declaration", "white", "entity.name.class"]],
          start(F, '"', true, "fTD"), start(F, "'", true, "fTS"), start(F, '"', false, "fD"), start(F, "'", false, "fS"),
          start(P, '"', true, "tD"), start(P, "'", true, "tS"), start(P, '"', false, "sD"), start(P, "'", false, "sS"),
          { include: "@expr" }
        ],
        expr: expr,
        interp: [
          [/\}/, { token: "string.interpolation", next: "@pop" }],
          [/![rsa]/, "operator"],
          [/:[^}]*(?=\})/, "string"],            // format spec such as :.2f
          start(P, '"', false, "sD"), start(P, "'", false, "sS"),
          { include: "@expr" }
        ],
        tD: body('"', false, true), tS: body("'", false, true), sD: body('"', false, false), sS: body("'", false, false),
        fTD: body('"', true, true), fTS: body("'", true, true), fD: body('"', true, false), fS: body("'", true, false)
      }
    });

    var d = [ // dark: [token, hex, fontStyle?]
      ["comment", "7f848e", "italic"], ["string", "98c379"], ["string.escape", "56b6c2"],
      ["string.interpolation", "56b6c2"], ["number", "d19a66"], ["constant.language", "d19a66", "bold"],
      ["constant.name", "d19a66"], ["keyword.control", "c678dd"], ["keyword.declaration", "c678dd", "bold"],
      ["keyword.operator", "c678dd"], ["entity.name.function", "61afef", "bold"], ["entity.name.class", "e5c07b", "bold"],
      ["entity.function.call", "61afef"], ["support.function.builtin", "56b6c2"], ["support.type", "e5c07b"],
      ["type.identifier", "e5c07b"], ["variable.language", "e06c75", "italic"], ["variable.property", "e6a0a5"],
      ["annotation", "e5c07b"], ["operator", "56b6c2"], ["delimiter", "abb2bf"], ["identifier", "d7dae0"]
    ];
    var l = [ // light
      ["comment", "8b8f9a", "italic"], ["string", "3f8a3a"], ["string.escape", "0b7c8a"],
      ["string.interpolation", "0b7c8a"], ["number", "a45c00"], ["constant.language", "a45c00", "bold"],
      ["constant.name", "a45c00"], ["keyword.control", "9a2fb3"], ["keyword.declaration", "9a2fb3", "bold"],
      ["keyword.operator", "9a2fb3"], ["entity.name.function", "2a62d6", "bold"], ["entity.name.class", "a86a00", "bold"],
      ["entity.function.call", "2a62d6"], ["support.function.builtin", "0b7c8a"], ["support.type", "a86a00"],
      ["type.identifier", "a86a00"], ["variable.language", "d03b3b", "italic"], ["variable.property", "b8484d"],
      ["annotation", "a86a00"], ["operator", "0b7c8a"], ["delimiter", "50545c"], ["identifier", "24272e"]
    ];
    function rules(list) {
      return list.map(function (r) { var o = { token: r[0], foreground: r[1] }; if (r[2]) o.fontStyle = r[2]; return o; });
    }
    monaco.editor.defineTheme("neet-dark", {
      base: "vs-dark", inherit: true, rules: rules(d),
      colors: {
        "editor.background": "#1e1e1e", "editor.foreground": "#d7dae0",
        "editor.lineHighlightBackground": "#ffffff0b", "editor.lineHighlightBorder": "#00000000",
        "editor.selectionBackground": "#3d5a8099", "editor.inactiveSelectionBackground": "#3d5a8055",
        "editor.wordHighlightBackground": "#ffffff14", "editorCursor.foreground": "#e5c07b",
        "editorLineNumber.foreground": "#5c6370", "editorLineNumber.activeForeground": "#c9d1d9",
        "editorIndentGuide.background1": "#ffffff14", "editorIndentGuide.activeBackground1": "#ffffff38",
        "editorBracketMatch.background": "#56b6c230", "editorBracketMatch.border": "#56b6c2aa",
        "editorBracketHighlight.foreground1": "#e5c07b", "editorBracketHighlight.foreground2": "#c678dd",
        "editorBracketHighlight.foreground3": "#61afef", "editorBracketHighlight.foreground4": "#98c379",
        "editorBracketHighlight.foreground5": "#e06c75", "editorBracketHighlight.foreground6": "#56b6c2"
      }
    });
    monaco.editor.defineTheme("neet-light", {
      base: "vs", inherit: true, rules: rules(l),
      colors: {
        "editor.background": "#f7f7f8", "editor.foreground": "#24272e",
        "editor.lineHighlightBackground": "#0000000a", "editor.lineHighlightBorder": "#00000000",
        "editor.selectionBackground": "#b3d1ff99", "editor.inactiveSelectionBackground": "#b3d1ff55",
        "editorCursor.foreground": "#2a62d6",
        "editorLineNumber.foreground": "#9aa0ab", "editorLineNumber.activeForeground": "#3b4048",
        "editorIndentGuide.background1": "#00000014", "editorIndentGuide.activeBackground1": "#00000038",
        "editorBracketMatch.background": "#0b7c8a22", "editorBracketMatch.border": "#0b7c8aaa",
        "editorBracketHighlight.foreground1": "#a86a00", "editorBracketHighlight.foreground2": "#9a2fb3",
        "editorBracketHighlight.foreground3": "#2a62d6", "editorBracketHighlight.foreground4": "#3f8a3a",
        "editorBracketHighlight.foreground5": "#d03b3b", "editorBracketHighlight.foreground6": "#0b7c8a"
      }
    });
  }

  window.registerNeetPython = register;
})();
