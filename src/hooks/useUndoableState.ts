import { useMemo, useReducer } from 'react';

/** How many past snapshots to retain — bounds memory for very long editing
 *  sessions without meaningfully limiting practical undo depth. */
const MAX_HISTORY = 100;

interface UndoableState<T> {
  past: T[];
  present: T;
  future: T[];
}

type Updater<T> = T | ((prev: T) => T);

type Action<T> =
  | { type: 'set'; updater: Updater<T> }
  | { type: 'setSilent'; updater: Updater<T> }
  | { type: 'commit'; baseline: T; updater: Updater<T> }
  | { type: 'reset'; value: T }
  | { type: 'undo' }
  | { type: 'redo' };

function resolve<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
}

/** Pure reducer — safe under React 18 StrictMode's double-invoke, since it
 *  only ever derives its result from its own arguments (no external refs are
 *  mutated), unlike a naive "push onto a ref array inside setState" approach. */
function reducer<T>(state: UndoableState<T>, action: Action<T>): UndoableState<T> {
  switch (action.type) {
    case 'set': {
      const next = resolve(action.updater, state.present);
      if (Object.is(next, state.present)) return state;
      const past = [...state.past, state.present];
      if (past.length > MAX_HISTORY) past.shift();
      return { past, present: next, future: [] };
    }
    case 'setSilent': {
      // Updates the live value without recording an undo step and without
      // touching existing history — for programmatic/background updates
      // (e.g. mirroring a shared ETD) that shouldn't appear as an undoable
      // edit, but also shouldn't wipe out the user's real edit history.
      const next = resolve(action.updater, state.present);
      if (Object.is(next, state.present)) return state;
      return { ...state, present: next };
    }
    case 'commit': {
      // Like `set`, but records `baseline` (captured by the caller before
      // a multi-step gesture began, e.g. a marker drag's position *before*
      // the first of many `setSilent` preview frames) as the undo target,
      // instead of whatever `present` happens to be right now — which, after
      // a run of silent updates, is just the last intermediate frame, not
      // the gesture's real starting point. Without this, undoing a drag
      // would only step back by its final, near-imperceptible frame instead
      // of all the way back to where it started.
      const next = resolve(action.updater, action.baseline);
      if (Object.is(next, action.baseline)) return { ...state, present: next };
      const past = [...state.past, action.baseline];
      if (past.length > MAX_HISTORY) past.shift();
      return { past, present: next, future: [] };
    }
    case 'reset':
      // Full replacement (loading a different route/voyage, clearing the
      // route, discarding an edit) — starts a fresh history instead of
      // treating the previous route as something to "undo" back to.
      return { past: [], present: action.value, future: [] };
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { past: [...state.past, state.present], present: next, future: rest };
    }
    default:
      return state;
  }
}

/**
 * `useState`-like hook that also tracks undo/redo history of its value.
 *
 * `setValue` behaves exactly like `useState`'s setter (accepts a value or a
 * functional updater) and records a new undo step. `resetValue` replaces the
 * value and clears all history (for wholesale replacements that shouldn't be
 * "undo-able" back into, e.g. loading a different route). `setValueSilently`
 * updates the value without recording a step and without touching existing
 * history (for background/programmatic syncs). `commitValue` is for
 * multi-step gestures (e.g. dragging a marker through many live preview
 * frames via `setValueSilently`): pass the value captured *before* the
 * gesture started as `baseline`, so the one undo step this records spans the
 * whole gesture (start → end) instead of just its last intermediate frame.
 */
export function useUndoableState<T>(initial: T | (() => T)) {
  const [state, dispatch] = useReducer(
    reducer as (s: UndoableState<T>, a: Action<T>) => UndoableState<T>,
    undefined,
    () =>
      ({
        past: [],
        present: typeof initial === 'function' ? (initial as () => T)() : initial,
        future: [],
      }) as UndoableState<T>,
  );

  return useMemo(
    () => ({
      value: state.present,
      setValue: (updater: Updater<T>) => dispatch({ type: 'set', updater }),
      setValueSilently: (updater: Updater<T>) => dispatch({ type: 'setSilent', updater }),
      commitValue: (baseline: T, updater: Updater<T>) => dispatch({ type: 'commit', baseline, updater }),
      resetValue: (value: Updater<T>) =>
        dispatch({ type: 'reset', value: resolve(value, state.present) }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [state],
  );
}
