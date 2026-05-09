import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mizan: {
          // Core backgrounds
          shell:        "#173B34",
          shellDark:    "#0D2823",
          shellSoft:    "#1F4A42",

          // Light surfaces
          bg:           "#FFFCF4",
          surface:      "#FBF5E8",
          surfaceSoft:  "#F7ECD6",

          // Text
          text:         "#071A16",
          textMuted:    "#4D6A5B",
          textOnDark:   "#FFF9E8",

          // Accent gold
          accent:       "#D2A04A",
          accentSoft:   "#FFE7A6",
          accentGlow:   "#F6D889",

          // Semantic
          border:       "#D5E3DA",
          success:      "#2A6156",
          warning:      "#C9852D",
          danger:       "#B95045",

          // Person / assignee accents (dots & avatars — stay inside Mizan family)
          personRose:   "#A64D60",
          personAmber:  "#C9852D",
          personFern:   "#2F6860",
          personRiver:  "#3E5C66",
          personPlum:   "#5B4D76",
        },
      },

      fontSize: {
        // Body / UI
        "kiosk-xs":   ["0.875rem", { lineHeight: "1.35",  letterSpacing: "-0.01em"  }],
        "kiosk-sm":   ["1.05rem",  { lineHeight: "1.4",   letterSpacing: "-0.005em" }],
        "kiosk-base": ["1.2rem",   { lineHeight: "1.45",  letterSpacing: "-0.01em"  }],
        "kiosk-lg":   ["1.45rem",  { lineHeight: "1.4",   letterSpacing: "-0.015em" }],

        // Headings
        "kiosk-xl":   ["1.85rem",  { lineHeight: "1.25",  letterSpacing: "-0.02em"  }],
        "kiosk-2xl":  ["2.35rem",  { lineHeight: "1.15",  letterSpacing: "-0.025em" }],
        "kiosk-3xl":  ["2.9rem",   { lineHeight: "1.1",   letterSpacing: "-0.03em"  }],

        // Hero / display
        "kiosk-hero":    ["3.65rem", { lineHeight: "1.05", letterSpacing: "-0.035em" }],
        "kiosk-display": ["4.5rem",  { lineHeight: "1",    letterSpacing: "-0.04em"  }],

        // Prayer times
        "kiosk-prayer": ["1.65rem", { lineHeight: "1.3",  letterSpacing: "-0.01em"  }],
        "kiosk-time":   ["2.1rem",  { lineHeight: "1.1",  letterSpacing: "-0.02em"  }],
      },

      fontWeight: {
        normal:   "420",
        medium:   "520",
        semibold: "610",
        bold:     "680",
      },

      lineHeight: {
        tight:   "1.1",
        snug:    "1.25",
        relaxed: "1.65",
      },

      letterSpacing: {
        tighter: "-0.04em",
        tight:   "-0.025em",
        normal:  "-0.01em",
        wide:    "0.015em",
      },

      fontFamily: {
        display: ["DM Serif Display", "serif"],
        sans: ["Quicksand", "system-ui", "sans-serif"],
        handwriting: ["Caveat", "cursive"],
      },

      spacing: {
        touch:     "3.5rem",
        "touch-lg":"4.75rem",
        kiosk:     "1.5rem",
        "kiosk-lg":"2.25rem",
      },

      borderRadius: {
        kiosk:    "1.75rem",
        "kiosk-lg":"2.25rem",
        "kiosk-xl":"2.75rem",
      },

      boxShadow: {
        kiosk:        "0 10px 30px rgba(7, 26, 22, 0.14)",
        "kiosk-soft": "0 4px 16px rgba(7, 26, 22, 0.08)",
        "kiosk-gold": "0 0 45px rgba(246, 216, 137, 0.28)",
        "kiosk-inner":"inset 0 2px 8px rgba(0,0,0,0.08)",
      },

      backgroundImage: {
        "mizan-shell": "linear-gradient(180deg, #173B34 0%, #0D2823 100%)",
        "mizan-gold":  "linear-gradient(135deg, #FFE7A6 0%, #D2A04A 100%)",
        "mizan-glow":  "radial-gradient(circle at center, rgba(246, 216, 137, 0.25) 0%, transparent 70%)",
      },
    },
  },
} satisfies Config;
