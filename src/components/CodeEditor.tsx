import { useEffect, useRef } from "react";
import {
  Decoration,
  EditorView,
  keymap,
  highlightActiveLine,
  drawSelection,
  type DecorationSet,
} from "@codemirror/view";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import {
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { tags } from "@lezer/highlight";
import { KITS, SOUND_ALIASES, SOUNDS, SOUND_IDS } from "../lib/sounds";
import { pick, t } from "../lib/i18n";
import { SCALES, SYNTH_NAMES } from "../lib/parser";

// ------------------------------------------------------- syntax highlighting

const COMMANDS = [
  "fast", "slow", "rev", "every", "swing", "lpf", "hpf", "res", "delay", "reverb", "room",
  "size", "drive", "duck", "sub", "rumble", "pitch", "cut", "cutoff", "env", "decay",
  "pan", "gain", "synth", "scale", "kit", "bank",
];
const COMMAND_SET = new Set(COMMANDS);
const COMMAND_VALUES = new Set([
  ...SYNTH_NAMES,
  ...Object.keys(SCALES),
  ...Object.keys(KITS),
  ...Object.values(KITS),
  "rev",
]);

const language = StreamLanguage.define<{ afterPipe: boolean }>({
  startState: () => ({ afterPipe: false }),
  token(stream, state) {
    if (stream.sol()) state.afterPipe = false;
    if (stream.eatSpace()) return null;

    if (stream.match(/^--/)) {
      stream.skipToEnd();
      return "comment";
    }

    const ch = stream.peek();
    if (ch === "|") {
      stream.next();
      state.afterPipe = true;
      return "operator";
    }
    if (ch && "[]<>".includes(ch)) {
      stream.next();
      return "bracket";
    }
    if (stream.match(/^~(?:\*\d+|\?)*/)) return "null";
    if (stream.match(/^_(?=[\s\]>|]|$)/)) return "null"; // tie: holds the previous sound

    if (!stream.match(/^[^\s[\]<>|]+/)) {
      stream.next();
      return null;
    }
    const text = stream.current();

    if (state.afterPipe) {
      if (COMMAND_SET.has(text)) return "keyword";
      if (/^-?[\d.]+$/.test(text)) return "number";
      if (COMMAND_VALUES.has(text)) return "string";
      return "invalid";
    }

    const base = text.replace(/(\*\d+|\?|\^)+$/, "").split(":")[0].split("(")[0];
    if (SOUND_IDS.has(base) || base in SOUND_ALIASES) return "atom";
    if (/^v[1-8]$/.test(base)) return "atom";
    if (/^[a-g]#?\d?$/.test(base)) return "string";
    if (/^-?\d+$/.test(base)) return "number";
    return "invalid";
  },
});

const highlight = HighlightStyle.define([
  { tag: tags.comment, color: "#5a5a5a", fontStyle: "italic" },
  { tag: tags.atom, color: "#c8ff00" }, // drum sounds — acid
  { tag: tags.string, color: "#00e5ff" }, // notes + command values — ice
  { tag: tags.number, color: "#ffd400" }, // warn yellow
  { tag: tags.keyword, color: "#ff3ea5" }, // | commands — magenta
  { tag: tags.operator, color: "#ff3ea5" },
  { tag: tags.bracket, color: "#8a8a8a" },
  { tag: tags.null, color: "#5a5a5a" }, // silences
  { tag: tags.invalid, color: "#ff4d4d" },
]);

// -------------------------------------------------------------- hit flash

const flashMark = Decoration.mark({ class: "cm-hit-flash" });
const addFlash = StateEffect.define<{ from: number; to: number }>();
const removeFlash = StateEffect.define<{ from: number; to: number }>();

const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(addFlash)) {
        const { from, to } = effect.value;
        if (from < to && to <= tr.newDoc.length) {
          decorations = decorations.update({ add: [flashMark.range(from, to)] });
        }
      }
      if (effect.is(removeFlash)) {
        const { from, to } = effect.value;
        decorations = decorations.update({ filter: (f, t) => f !== from || t !== to });
      }
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// --------------------------------------------------------------- completion

const OPTIONS = [
  ...SOUNDS.map((s) => ({ label: s.id, type: "keyword", detail: pick(s.name) })),
  ...COMMANDS.map((c) => ({ label: c, type: "function", detail: t("ac.trick") })),
  ...SYNTH_NAMES.map((s) => ({ label: s, type: "variable", detail: t("ac.synth") })),
  ...["mayor", "menor", "penta", "dorica", "frigia", "lidia"].map((s) => ({
    label: s,
    type: "variable",
    detail: t("ac.scale"),
  })),
  ...Object.keys(KITS).map((k) => ({
    label: k,
    type: "variable",
    detail: t("ac.kit", { name: KITS[k] }),
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    label: `v${i + 1}`,
    type: "keyword",
    detail: t("ac.voice"),
  })),
];

function completions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[a-z][a-z0-9]*$/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return { from: word.from, options: OPTIONS, validFor: /^[a-z][a-z0-9]*$/ };
}

// -------------------------------------------------------------------- theme

const theme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent", height: "100%", fontSize: "14px" },
    ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.9" },
    ".cm-content": { padding: "14px 16px", caretColor: "#c8ff00" },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor": { borderLeftColor: "#c8ff00", borderLeftWidth: "2px" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(200,255,0,0.18)",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.03)" },
    ".cm-hit-flash": {
      backgroundColor: "rgba(200,255,0,0.45)",
      color: "#000",
      boxShadow: "0 0 12px rgba(200,255,0,0.6)",
    },
    ".cm-tooltip": {
      backgroundColor: "#0a0a0a",
      border: "1px solid rgba(200,255,0,0.3)",
      color: "#d6d6d6",
      fontFamily: "inherit",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "rgba(200,255,0,0.15)",
      color: "#c8ff00",
    },
  },
  { dark: true }
);

// ---------------------------------------------------------------- component

interface Props {
  value: string;
  onChange: (code: string) => void;
  onPlay?: () => void;
  onStop?: () => void;
  className?: string;
  /** Receives a fn that flashes a [from, to) range when its token sounds. */
  registerFlash?: (flash: (from: number, to: number) => void) => void;
  /** Display-only mode (the FM console shows the score without editing). */
  readOnly?: boolean;
}

/** CodeMirror 6 wrapper. Ctrl/Cmd+Enter plays, Ctrl/Cmd+. stops. */
export default function CodeEditor({
  value,
  onChange,
  onPlay,
  onStop,
  className,
  registerFlash,
  readOnly = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onPlay, onStop });
  callbacks.current = { onChange, onPlay, onStop };

  useEffect(() => {
    const view = new EditorView({
      doc: value,
      parent: containerRef.current!,
      extensions: [
        ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        flashField,
        language,
        syntaxHighlighting(highlight),
        autocompletion({ override: [completions] }),
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              callbacks.current.onPlay?.();
              return true;
            },
          },
          {
            key: "Mod-.",
            run: () => {
              callbacks.current.onStop?.();
              return true;
            },
          },
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        theme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
        }),
      ],
    });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value changes (snippets, Reset) — don't clobber user typing.
  useEffect(() => {
    const view = viewRef.current;
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  // Expose the hit-flash entry point to the parent.
  useEffect(() => {
    registerFlash?.((from, to) => {
      const view = viewRef.current;
      if (!view || from >= to || to > view.state.doc.length) return;
      view.dispatch({ effects: addFlash.of({ from, to }) });
      window.setTimeout(() => {
        viewRef.current?.dispatch({ effects: removeFlash.of({ from, to }) });
      }, 140);
    });
  }, [registerFlash]);

  return <div ref={containerRef} className={className} />;
}
