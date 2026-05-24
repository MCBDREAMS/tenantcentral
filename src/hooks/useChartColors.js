/**
 * Returns theme-aware chart colors that work in both light and dark mode.
 * Colors are derived from CSS variables where possible, with sensible
 * high-contrast fallbacks that look good on dark backgrounds.
 */
export function useChartColors() {
  return {
    compliant:    "#10b981", // emerald-500
    nonCompliant: "#ef4444", // red-500
    gracePeriod:  "#f59e0b", // amber-500
    notEvaluated: "#6b7280", // gray-500
    enabled:      "#10b981",
    reportOnly:   "#3b82f6", // blue-500
    disabled:     "#6b7280",
    installed:    "#22c55e", // green-500
    failed:       "#ef4444",
    other:        "#94a3b8", // slate-400
    // Palette for multi-series charts
    palette: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"],
    // Axis / grid text — legible on both light and dark chart backgrounds
    axisColor: "hsl(var(--muted-foreground))",
    gridColor:  "hsl(var(--border))",
    tooltipBg:  "hsl(var(--card))",
    tooltipBorder: "hsl(var(--border))",
    tooltipText: "hsl(var(--card-foreground))",
  };
}