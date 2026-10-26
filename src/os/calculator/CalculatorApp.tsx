"use client";

import { useEffect, useReducer, useRef, type KeyboardEvent } from "react";
import { Delete } from "lucide-react";

type Operator = "+" | "−" | "×" | "÷";

type CalculatorState = {
  display: string;
  previous: number | null;
  operator: Operator | null;
  waitingForOperand: boolean;
  expression: string;
};

const initialState: CalculatorState = {
  display: "0",
  previous: null,
  operator: null,
  waitingForOperand: false,
  expression: "",
};

const keys = [
  "C", "±", "%", "÷",
  "7", "8", "9", "×",
  "4", "5", "6", "−",
  "1", "2", "3", "+",
  "⌫", "0", ".", "=",
] as const;

function calculate(a: number, b: number, operator: Operator): number {
  switch (operator) {
    case "+": return a + b;
    case "−": return a - b;
    case "×": return a * b;
    case "÷": return a / b;
  }
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "Error";
  return String(Number(value.toPrecision(12)));
}

function reducer(state: CalculatorState, key: string): CalculatorState {
  if (key === "C") return initialState;

  if (/^[0-9]$/.test(key)) {
    if (state.display === "Error") return { ...initialState, display: key };
    if (state.waitingForOperand) {
      return {
        ...state,
        display: key,
        waitingForOperand: false,
        expression: state.operator ? state.expression : "",
      };
    }
    if (state.display.replace(/[-.]/g, "").length >= 15) return state;
    return {
      ...state,
      display: state.display === "0" ? key : state.display + key,
    };
  }

  if (key === ".") {
    if (state.display === "Error") return { ...initialState, display: "0." };
    if (state.waitingForOperand) {
      return { ...state, display: "0.", waitingForOperand: false };
    }
    return state.display.includes(".")
      ? state
      : { ...state, display: state.display + "." };
  }

  if (key === "⌫") {
    if (state.display === "Error" || state.waitingForOperand) {
      return { ...state, display: "0", waitingForOperand: false };
    }
    const shortened = state.display.slice(0, -1);
    return {
      ...state,
      display: shortened === "" || shortened === "-" ? "0" : shortened,
    };
  }

  if (key === "±") {
    if (state.display === "Error" || Number(state.display) === 0) return state;
    return {
      ...state,
      display: state.display.startsWith("-")
        ? state.display.slice(1)
        : "-" + state.display,
    };
  }

  if (key === "%") {
    if (state.display === "Error") return state;
    return {
      ...state,
      display: formatNumber(Number(state.display) / 100),
      waitingForOperand: false,
    };
  }

  if (["+", "−", "×", "÷"].includes(key)) {
    if (state.display === "Error") return state;
    const operator = key as Operator;
    let previous = Number(state.display);

    if (state.operator !== null && state.previous !== null) {
      if (state.waitingForOperand) {
        return {
          ...state,
          operator,
          expression: `${state.previous} ${operator}`,
        };
      }
      previous = calculate(state.previous, previous, state.operator);
      if (!Number.isFinite(previous)) {
        return { ...initialState, display: "Error", expression: "Cannot divide by zero" };
      }
    }

    const formatted = formatNumber(previous);
    return {
      display: formatted,
      previous: Number(formatted),
      operator,
      waitingForOperand: true,
      expression: `${formatted} ${operator}`,
    };
  }

  if (key === "=") {
    if (state.operator === null || state.previous === null || state.waitingForOperand) {
      return state;
    }
    const result = calculate(state.previous, Number(state.display), state.operator);
    if (!Number.isFinite(result)) {
      return { ...initialState, display: "Error", expression: "Cannot divide by zero" };
    }
    return {
      ...initialState,
      display: formatNumber(result),
      waitingForOperand: true,
      expression: `${state.previous} ${state.operator} ${state.display} =`,
    };
  }

  return state;
}

const keyboardKeys: Record<string, string> = {
  Enter: "=", "=": "=", Backspace: "⌫", Delete: "C", Escape: "C",
  "+": "+", "-": "−", "*": "×", "/": "÷", ".": ".", "%": "%",
};

export function CalculatorApp() {
  const [state, press] = useReducer(reducer, initialState);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const key = /^[0-9]$/.test(event.key)
      ? event.key
      : keyboardKeys[event.key];
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    press(key);
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Calculator"
      className="flex h-full min-h-0 w-full flex-col gap-3 bg-slate-950 p-3 text-white outline-none"
    >
      <div className="flex min-h-[88px] flex-col items-end justify-end overflow-hidden rounded-xl bg-slate-900 px-4 py-3">
        <div className="h-5 max-w-full truncate text-right text-xs text-slate-400" aria-live="polite">
          {state.expression || "\u00a0"}
        </div>
        <div className="max-w-full truncate text-right text-4xl font-semibold tabular-nums" aria-live="polite">
          {state.display}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-5 gap-2">
        {keys.map((key) => {
          const isOperator = ["+", "−", "×", "÷"].includes(key);
          const isUtility = ["C", "±", "%", "⌫"].includes(key);
          const className = key === "="
            ? "bg-blue-600 text-white hover:bg-blue-500"
            : isOperator
              ? "bg-slate-700 text-blue-200 hover:bg-slate-600"
              : isUtility
                ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                : "bg-slate-900 text-white hover:bg-slate-800";

          return (
            <button
              key={key}
              type="button"
              aria-label={key === "⌫" ? "Backspace" : key === "C" ? "Clear" : key}
              onClick={() => press(key)}
              className={`flex min-h-0 items-center justify-center rounded-xl text-xl font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${className}`}
            >
              {key === "⌫" ? <Delete size={22} aria-hidden="true" /> : key}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CalculatorApp;
