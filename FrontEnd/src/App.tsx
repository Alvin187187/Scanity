import {
  useState,
  useEffect,
  useRef,
  Fragment,
  type ReactNode,
  type CSSProperties,
  type ChangeEvent,
} from "react"
import { createWorker } from "tesseract.js"
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser"
import { BarcodeFormat, DecodeHintType } from "@zxing/library"
import logoImg from "@/imports/image-19.png"
import beefNoodlesImg from "@/imports/beef_noodles.jpeg"
import chickenNoodlesImg from "@/imports/chicken_noodles.jpeg"
import milkImg from "@/imports/milk_scanity.jpeg"
import orangeJuiceImg from "@/imports/orange_juice_scanity.jpeg"
import chocolateBarImg from "@/imports/chocolate_scanity.jpeg"
import potatoChipsImg from "@/imports/potato_chips.jpeg"
import tunaSandwichImg from "@/imports/tuna_sandwhich.jpeg"
import yogurtImg from "@/imports/yogurt.jpeg"
import cornflakesImg from "@/imports/corn_flakes_scanity.jpeg"
import aboutHeroImg from "@/imports/bgs.png"
import aboutLabelImg from "@/imports/bgss.png"

import { loginUser, registerUser } from "./api/auth"

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  green: "var(--scanity-green)",
  greenLight: "var(--scanity-gold)",
  greenMid: "var(--scanity-green-mid)",

  mocha: "var(--scanity-mocha)",
  mochaDark: "var(--scanity-mocha-dark)",
  mochaLight: "var(--scanity-mocha-light)",
  mochaPale: "var(--scanity-mocha-pale)",

  white: "var(--scanity-white)",
  offWhite: "var(--scanity-off-white)",

  black: "var(--scanity-black)",
  gray: "var(--scanity-gray)",
  grayLight: "var(--scanity-gray-light)",

  inputBg: "var(--scanity-input-bg)",
  border: "var(--scanity-border)",

  goldDark: "var(--scanity-gold-dark)",
  textOnDark: "var(--scanity-text-on-dark)",

  statusSafe: "var(--scanity-success)",
  statusCaution: "var(--scanity-warning)",
  statusDanger: "var(--scanity-danger)",

  greenDark: "var(--scanity-green-dark)",
  greenSoft: "var(--scanity-green-soft)",
  greenText: "var(--scanity-green-text)",

  dangerBg: "var(--scanity-danger-bg)",
  dangerText: "var(--scanity-danger-text)",

  warningText: "var(--scanity-warning-text)",

  blue: "var(--scanity-blue)",
  blueSoft: "var(--scanity-blue-soft)",

  red: "var(--scanity-red)",
  redSoft: "var(--scanity-red-soft)",

  brown: "var(--scanity-brown)",

  sidebarBg: "var(--scanity-sidebar-bg)",
  sidebarDark: "var(--scanity-sidebar-dark)",

  yellow: "var(--scanity-yellow)",
}

// ── Typography ────────────────────────────────────────────────────────────────
const FONT_HEAD = "var(--scanity-font-heading)"
const FONT_BODY = "var(--scanity-font-body)"
const FONT = "var(--scanity-font-body)"

// ── Light-theme design tokens ─────────────────────────────────────────────────
const PALETTE = {
  page: "#E8E5E0",
  panel: "#FFFFFF",

  green: "#176B3A",
  greenDark: "#124F2A",
  greenMid: "#2E8B57",
  greenLight: "#E7F3EC",
  greenText: "#1F7A44",

  textDark: "#1A1A1A",
  textMuted: "#6B6B6B",

  border: "#E5E3DC",

  danger: "#D94A4A",
  dangerBg: "#FBEAEA",

  gold: C.greenLight,
  goldDark: "#d8a650",

  brown: "#593217",

  cautionText: "#8A6300",
  dangerText: "#B3261E",
}

const cardShadow = "0 5px 0 rgba(0,0,0,0.08)"

const BARCODE_BARS = [
  2, 1, 3, 1, 1, 2, 4, 1, 2, 1, 3, 2, 1, 1, 4, 2,
  1, 3, 1, 2, 1, 1, 3, 2, 4, 1, 1, 2, 3, 1, 2, 1,
  4, 1, 1, 3, 2, 1, 2, 1,
]

// ── Safe-area constant ───────────────────────────────────────────────────────
const SAFE_TOP =
  typeof window !== "undefined" && window.self !== window.top
    ? "max(59px, env(safe-area-inset-top))"
    : "env(safe-area-inset-top, 0px)"

type Screen =
  | "splash"
  | "login"
  | "register"
  | "success"
  | "allergies"
  | "health"
  | "loading"
  | "allset"
  | "dashboard"
  | "history"
  | "barcode"
  | "ocr"
  | "profile"
  | "help"
  | "about"
  | "privacy"
  | "terms"
  | "settings"
  | "delete"
  | "forgotPassword"
  | "resetPassword"
  | "confirmationPassword"
  | "productResult"
  | "productCompare"

// ── Responsive helpers ───────────────────────────────────────────────────────
function useIsDesktop(breakpoint = 1024) {
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      window.innerWidth >= breakpoint,
  )

  useEffect(() => {
    const onResize = () => {
      setIsDesktop(window.innerWidth >= breakpoint)
    }

    onResize()

    window.addEventListener("resize", onResize)

    return () => {
      window.removeEventListener("resize", onResize)
    }
  }, [breakpoint])

  return isDesktop
}

// ── Center helper ─────────────────────────────────────────────────────────────
function Center({
  children,
  maxWidth = 640,
  style,
}: {
  children: ReactNode
  maxWidth?: number
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth,
        marginLeft: "auto",
        marginRight: "auto",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── App shell ─────────────────────────────────────────────────────────────────
function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        minHeight: "100dvh",
        background: C.offWhite,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ── Back button ───────────────────────────────────────────────────────────────
function BackBtn({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label="Go back"
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: `1.5px solid ${C.border}`,
        background: C.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      }}
    >
      <svg
        width="8"
        height="14"
        viewBox="0 0 8 14"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M7 1L1 7L7 13"
          stroke={C.black}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

// ── Logo mark ─────────────────────────────────────────────────────────────────
function Logo({
  size = 160,
  style,
}: {
  size?: number
  style?: CSSProperties
}) {
  return (
    <img
      src={logoImg}
      alt="Scanity logo"
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        flexShrink: 0,
        mixBlendMode: "multiply",
        ...style,
      }}
    />
  )
}

// ── Input field ───────────────────────────────────────────────────────────────
function Field({
  icon,
  placeholder,
  type = "text",
  value,
  onChange,
  hint,
}: {
  icon: ReactNode
  placeholder: string
  type?: string
  value: string
  onChange: (v: string) => void
  hint?: string
}) {
  const [show, setShow] = useState(false)
  const [focused, setFocused] = useState(false)

  const isPassword = type === "password"
  const inputType =
    isPassword && !show ? "password" : "text"

  return (
    <div style={{ marginBottom: hint ? 4 : 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,

          background: C.inputBg,

          border: `1.5px solid ${
            focused ? C.mochaLight : C.border
          }`,

          borderRadius: 14,

          padding: "13px 15px",

          boxShadow: focused
            ? `0 0 0 3px ${C.mochaLight}22`
            : "none",

          transition:
            "border-color 0.18s ease, box-shadow 0.18s ease",
        }}
      >
        {/* Input icon */}
        <span
          style={{
            color: C.mochaLight,
            flexShrink: 0,

            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            width: 20,
            height: 20,
          }}
        >
          {icon}
        </span>

        {/* Input */}
        <input
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            minWidth: 0,

            background: "transparent",
            border: "none",
            outline: "none",

            fontFamily: FONT_BODY,
            fontSize: 14,
            color: C.black,

            padding: 0,
          }}
        />

        {/* Password visibility button */}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={
              show ? "Hide password" : "Show password"
            }
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",

              background: "none",
              border: "none",

              cursor: "pointer",

              color: C.gray,

              padding: 2,

              flexShrink: 0,
            }}
          >
            {show ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Hint text */}
      {hint && (
        <p
          style={{
            fontSize: 10,
            color: C.gray,

            marginTop: 4,
            marginLeft: 4,
            marginBottom: 10,

            fontFamily: FONT_BODY,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  )
}

// ── Primary button ────────────────────────────────────────────────────────────
function PrimaryBtn({
  label,
  onClick,
  color = C.mocha,
}: {
  label: string
  onClick: () => void
  color?: string
}) {
  const [hover, setHover] = useState(false)

  return (
    <button
      type="button"
      className="scanity-btn scanity-btn-primary"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%",
        padding: "15px 16px",
        borderRadius: 14,
        border: "none",

        background: hover ? C.mochaDark : color,
        color: C.white,

        fontFamily: FONT_HEAD,
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: "0.02em",

        cursor: "pointer",

        transition:
          "background 0.18s ease, transform 0.12s ease, box-shadow 0.18s ease",

        boxShadow: hover
          ? `0 6px 18px ${color}55`
          : `0 4px 14px ${color}40`,

        transform: hover
          ? "translateY(-1px)"
          : "translateY(0)",
      }}
    >
      {label}
    </button>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function Tooltip({
  label,
  children,
  side = "bottom",
  wrapperStyle,
}: {
  label: string
  children: ReactNode
  side?: "top" | "bottom"
  wrapperStyle?: CSSProperties
}) {
  const [show, setShow] = useState(false)

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        ...wrapperStyle,
      }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}

      {show && (
        <span
          role="tooltip"
          style={{
            position: "absolute",

            ...(side === "bottom"
              ? { top: "calc(100% + 8px)" }
              : { bottom: "calc(100% + 8px)" }),

            left: "50%",
            transform: "translateX(-50%)",

            padding: "5px 10px",

            borderRadius: 7,

            background: "rgba(20,20,20,0.92)",
            color: "#FFFFFF",

            fontFamily: FONT_BODY,
            fontWeight: 600,
            fontSize: 10.5,
            lineHeight: 1.3,

            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 500,

            boxShadow:
              "0 4px 12px rgba(0,0,0,0.25)",
          }}
        >
          {label}
        </span>
      )}
    </span>
  )
}

// ── App sidebar ───────────────────────────────────────────────────────────────
// Desktop-persistent, mobile-collapsible.
// Shared by every interior post-login screen.
const SIDEBAR_WIDTH = 264

const SIDEBAR_MENU: {
  icon: string
  label: string
  screen: Screen
}[] = [
  {
    icon: "fa-home",
    label: "Dashboard",
    screen: "dashboard",
  },
  {
    icon: "fa-gear",
    label: "Settings",
    screen: "settings",
  },
  {
    icon: "fa-question-circle",
    label: "Help & FAQ",
    screen: "help",
  },
  {
    icon: "fa-info-circle",
    label: "About",
    screen: "about",
  },
]

function AppSidebar({
  go,
  open,
  onClose,
  isDesktop,
  active,
}: {
  go: (s: Screen) => void
  open: boolean
  onClose: () => void
  isDesktop: boolean
  active?: Screen
}) {
  const [showLogoutConfirm, setShowLogoutConfirm] =
    useState(false)

  const [showLogoutLoading, setShowLogoutLoading] =
    useState(false)

  const handleLogout = () => {
    setShowLogoutConfirm(false)
    setShowLogoutLoading(true)

    setTimeout(() => {
      setShowLogoutLoading(false)
      onClose()
      go("splash")
    }, 1800)
  }

  return (
    <>
      {/* ── Sidebar wrapper ─────────────────────────────────────────────── */}
      {(open || isDesktop) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "flex",

            pointerEvents:
              isDesktop ? "none" : "auto",
          }}
        >
          {/* ── Mobile overlay ─────────────────────────────────────────── */}
          {!isDesktop && (
            <div
              onClick={onClose}
              style={{
                position: "absolute",
                inset: 0,

                background:
                  "rgba(20,20,20,0.45)",

                backdropFilter: "blur(3px)",
                WebkitBackdropFilter:
                  "blur(3px)",

                cursor: "pointer",
              }}
            />
          )}

          {/* ── Sidebar ────────────────────────────────────────────────── */}
          <div
            style={{
              position: "relative",
              zIndex: 1,

              pointerEvents: "auto",

              width: isDesktop
                ? SIDEBAR_WIDTH
                : 260,

              height: "100%",

              background: `linear-gradient(
                180deg,
                ${PALETTE.green} 0%,
                ${PALETTE.greenDark} 100%
              )`,

              boxShadow:
                "6px 0 30px rgba(0,0,0,0.18)",

              display: "flex",
              flexDirection: "column",

              paddingTop: SAFE_TOP,
              paddingBottom: 20,

              boxSizing: "border-box",

              overflowY: "auto",

              WebkitOverflowScrolling: "touch",
            }}
          >
            {/* ── Sidebar header / logo ───────────────────────────────── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,

                padding: "0 20px 20px",

                borderBottom:
                  "1px solid rgba(255,255,255,0.14)",

                marginBottom: 8,
              }}
            >
              <img
                src={logoImg}
                alt="Scanity"
                style={{
                  width: 48,
                  height: 48,
                  objectFit: "contain",
                  flexShrink: 0,
                }}
              />

              <div
                style={{
                  minWidth: 0,
                }}
              >
                {/* Scanity logo text */}
                <p
                  style={{
                    margin: 0,
                    marginTop: 15,

                    fontFamily: FONT_HEAD,
                    fontWeight: 800,
                    fontSize: 18,

                    letterSpacing: "-0.01em",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    style={{
                      color: C.textOnDark,
                    }}
                  >
                    Scan
                  </span>

                  <span
                    style={{
                      color: C.greenLight,
                    }}
                  >
                    ity
                  </span>
                </p>

                {/* Tagline */}
                <p
                  style={{
                    margin: "4px 0 0",

                    fontFamily: FONT_BODY,
                    fontWeight: 500,
                    fontSize: 9,

                    letterSpacing: "0.12em",
                    textTransform: "uppercase",

                    color:
                      "rgba(255,255,255,0.55)",
                  }}
                >
                  See It. Know It. Eat It.
                </p>
              </div>

              {/* ── Mobile close button ───────────────────────────────── */}
              {!isDesktop && (
                <Tooltip
                  label="Close menu"
                  wrapperStyle={{
                    marginLeft: "auto",
                  }}
                >
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close menu"
                    style={{
                      width: 30,
                      height: 30,

                      flexShrink: 0,

                      borderRadius: 9,

                      border:
                        "1px solid rgba(255,255,255,0.20)",

                      background:
                        "rgba(255,255,255,0.08)",

                      color: C.white,

                      cursor: "pointer",

                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",

                      transition:
                        "background 0.18s ease, border-color 0.18s ease",
                    }}
                  >
                    <i
                      className="fa fa-close"
                      style={{
                        fontSize: 14,
                      }}
                    />
                  </button>
                </Tooltip>
              )}
            </div>

            {/* ── Navigation menu ──────────────────────────────────────── */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "8px 12px",
              }}
            >
              {SIDEBAR_MENU.map((item) => {
                const isActive =
                  active === item.screen

                return (
                  <button
                    key={item.screen}
                    type="button"
                    onClick={() => {
                      onClose()
                      go(item.screen)
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",

                      gap: 13,

                      padding: "12px 12px",
                      marginBottom: 3,

                      background: isActive
                        ? "rgba(255,255,255,0.14)"
                        : "transparent",

                      border:
                        "1px solid transparent",

                      borderRadius: 12,

                      cursor: "pointer",

                      width: "100%",

                      textAlign: "left",

                      transition:
                        "background 0.18s ease, transform 0.12s ease",
                    }}
                  >
                    {/* Menu icon */}
                    <span
                      style={{
                        width: 20,

                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",

                        flexShrink: 0,
                      }}
                    >
                      <i
                        className={`fa ${item.icon}`}
                        style={{
                          fontSize: 15,

                          color: isActive
                            ? C.greenLight
                            : "rgba(255,255,255,0.85)",

                          transition:
                            "color 0.18s ease",
                        }}
                      />
                    </span>

                    {/* Menu label */}
                    <span
                      style={{
                        fontFamily: FONT_BODY,

                        fontWeight: isActive
                          ? 700
                          : 500,

                        fontSize: 12.5,

                        color: C.white,

                        letterSpacing: "0.01em",
                      }}
                    >
                      {item.label}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* ── Push logout to bottom ───────────────────────────────── */}
            <div
              style={{
                flex: 1,
              }}
            />

            {/* ── Logout button ───────────────────────────────────────── */}
            <div
              style={{
                padding: "0 12px",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setShowLogoutConfirm(true)
                }
                style={{
                  display: "flex",
                  alignItems: "center",

                  gap: 13,

                  padding: "12px 12px",

                  width: "100%",

                  background:
                    "rgba(255,255,255,0.08)",

                  border:
                    "1px solid rgba(255,255,255,0.14)",

                  borderRadius: 12,

                  cursor: "pointer",

                  textAlign: "left",

                  transition:
                    "background 0.18s ease, border-color 0.18s ease",
                }}
              >
                {/* Logout icon */}
                <span
                  style={{
                    width: 20,

                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",

                    flexShrink: 0,
                  }}
                >
                  <i
                    className="fa fa-sign-out"
                    style={{
                      fontSize: 15,
                      color: C.greenLight,
                    }}
                  />
                </span>

                {/* Logout text */}
                <span
                  style={{
                    fontFamily: FONT_BODY,
                    fontWeight: 600,
                    fontSize: 12.5,
                    color: C.white,
                  }}
                >
                  Logout
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          LOGOUT CONFIRMATION MODAL
         ══════════════════════════════════════════════════════════════════ */}
      {showLogoutConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,

            zIndex: 300,

            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            padding: 20,

            background:
              "rgba(20,20,20,0.55)",

            backdropFilter: "blur(6px)",
            WebkitBackdropFilter:
              "blur(6px)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 310,

              padding: "28px 22px 22px",

              borderRadius: 24,

              background: PALETTE.panel,

              boxShadow:
                "0 20px 60px rgba(0,0,0,0.35)",

              textAlign: "center",

              boxSizing: "border-box",
            }}
          >
            {/* Logout icon circle */}
            <div
              style={{
                width: 64,
                height: 64,

                margin: "0 auto 16px",

                borderRadius: "50%",

                background:
                  PALETTE.greenLight,

                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <i
                className="fa fa-sign-out"
                style={{
                  fontSize: 26,
                  color: PALETTE.green,
                }}
              />
            </div>

            {/* Title */}
            <h2
              style={{
                margin: "0 0 8px",

                fontFamily: FONT_HEAD,
                fontWeight: 800,
                fontSize: 18,

                color: PALETTE.textDark,

                lineHeight: 1.35,
              }}
            >
              Are you sure you want to logout?
            </h2>

            {/* Description */}
            <p
              style={{
                margin: "0 auto 20px",

                maxWidth: 240,

                fontFamily: FONT_BODY,
                fontSize: 11,

                lineHeight: "16px",

                color: PALETTE.textMuted,
              }}
            >
              You will need to login again to access
              your account.
            </p>

            {/* Buttons */}
            <div
              style={{
                display: "flex",
                gap: 10,
                width: "100%",
              }}
            >
              {/* Cancel */}
              <button
                type="button"
                onClick={() =>
                  setShowLogoutConfirm(false)
                }
                style={{
                  flex: 1,

                  height: 44,

                  border:
                    `1.5px solid ${PALETTE.border}`,

                  borderRadius: 12,

                  background: PALETTE.panel,

                  color: PALETTE.textDark,

                  fontFamily: FONT_BODY,
                  fontWeight: 600,
                  fontSize: 12,

                  cursor: "pointer",

                  transition:
                    "background 0.18s ease",
                }}
              >
                Cancel
              </button>

              {/* Logout */}
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  flex: 1,

                  height: 44,

                  border: "none",

                  borderRadius: 12,

                  background: PALETTE.green,

                  color: C.white,

                  fontFamily: FONT_HEAD,
                  fontWeight: 700,
                  fontSize: 12,

                  cursor: "pointer",

                  boxShadow:
                    `0 5px 18px ${PALETTE.green}44`,

                  transition:
                    "transform 0.12s ease, box-shadow 0.18s ease",
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          LOGOUT LOADING MODAL
         ══════════════════════════════════════════════════════════════════ */}
      {showLogoutLoading && (
        <div
          style={{
            position: "fixed",
            inset: 0,

            zIndex: 310,

            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            padding: 20,

            background:
              "rgba(20,20,20,0.6)",

            backdropFilter: "blur(6px)",
            WebkitBackdropFilter:
              "blur(6px)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 300,

              padding: "30px 22px 24px",

              borderRadius: 24,

              background: PALETTE.panel,

              boxShadow:
                "0 20px 60px rgba(0,0,0,0.35)",

              textAlign: "center",

              boxSizing: "border-box",
            }}
          >
            {/* Logout icon */}
            <div
              style={{
                width: 64,
                height: 64,

                margin: "0 auto 16px",

                borderRadius: "50%",

                background:
                  PALETTE.greenLight,

                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <i
                className="fa fa-sign-out"
                style={{
                  fontSize: 25,
                  color: PALETTE.green,
                }}
              />
            </div>

            {/* Title */}
            <h2
              style={{
                margin: "0 0 7px",

                fontFamily: FONT_HEAD,
                fontWeight: 800,
                fontSize: 17,

                color: PALETTE.textDark,
              }}
            >
              Logging Out
            </h2>

            {/* Loading message */}
            <p
              style={{
                margin: "0 0 19px",

                fontFamily: FONT_HEAD,
                fontSize: 11,

                color: PALETTE.textMuted,
              }}
            >
              Please wait...
            </p>

            {/* Progress bar */}
            <div
              style={{
                width: "100%",
                height: 8,

                borderRadius: 8,

                overflow: "hidden",

                background: PALETTE.border,
              }}
            >
              <div
                style={{
                  width: "0%",
                  height: "100%",

                  borderRadius: 8,

                  background: PALETTE.green,

                  animation:
                    "logoutProgress 1.8s linear forwards",
                }}
              />
            </div>

            {/* Bottom message */}
            <p
              style={{
                margin: "11px 0 0",

                fontFamily: FONT_BODY,
                fontWeight: 600,
                fontSize: 10,

                color: PALETTE.textMuted,
              }}
            >
              Please wait a moment.
            </p>
          </div>
        </div>
      )}

      {/* ── Logout progress animation ─────────────────────────────────── */}
      <style>
        {`
          @keyframes logoutProgress {
            from {
              width: 0%;
            }

            to {
              width: 100%;
            }
          }
        `}
      </style>
    </>
  )
}
// ────────────────────────────────────────────────────────────────────────────
// Screens
// ────────────────────────────────────────────────────────────────────────────
function SplashScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <img
        src="https://images.unsplash.com/photo-1518843875459-f738682238a6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxmcmVzaCUyMGNvbG9yZnVsJTIwZnJ1aXRzJTIwdmVnZXRhYmxlcyUyMGhlYWx0aHklMjBmb29kfGVufDF8fHx8MTc4NjIzOTc1M3ww&ixlib=rb-4.1.0&q=80&w=1080"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(12,32,18,0.82)",
        }}
      />
      <Center
        maxWidth={480}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 1,
          gap: 0,
        }}
      >
        <img
          src={logoImg}
          alt="Scanity logo"
          style={{
            width: 280,
            height: 220,
            objectFit: "contain",
            mixBlendMode: "screen",
            filter: "brightness(1.15) saturate(1.25)",
          }}
        />
        <div style={{ textAlign: "center", marginTop: -16 }}>
          <h1
            style={{
              fontWeight: 800,
              fontSize: 42,
              letterSpacing: "-0.01em",
              lineHeight: 1,
              marginTop: 0,
              marginBottom: 0,
              marginLeft: 0,
              marginRight: 0,
              fontFamily: FONT_BODY,
            }}
          >
            <span style={{ color: C.textOnDark }}>Scan</span>
            <span style={{ color: C.greenLight }}>ity</span>
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "rgb(190, 223, 162)",
              marginTop: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              fontFamily: FONT_HEAD,
              fontWeight: 500,
            }}
          >
            See · Know · Eat
          </p>
        </div>
      </Center>
      <Center
        maxWidth={480}
        style={{ padding: "28px 28px 44px", position: "relative", zIndex: 1 }}
      >
        <p
          style={{
            fontSize: 15,
            color: "rgba(255,255,255,0.8)",
            lineHeight: 1.65,
            textAlign: "center",
            fontWeight: 500,
            marginBottom: 40,
            fontFamily: FONT_HEAD,
          }}
        >
          Your personal{" "}
          <span style={{ color: C.greenLight, fontWeight: 700 }}>nutrition</span> &{" "}
          <span style={{ color: C.greenLight, fontWeight: 700 }}>
            allergy safety
          </span>{" "}
          companion. Scan ingredients, understand what's in your food, and
          instantly know if it fits your dietary needs
        </p>
        <PrimaryBtn
          label="Get Started"
          onClick={() => go("login")}
          style={{
            width: "100%",
            padding: "17px",
            borderRadius: 18,
            border: "none",
            background: `linear-gradient(135deg, ${C.mocha} 0%, ${C.mochaDark} 100%)`,
            color: C.white,
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
            boxShadow: `0 8px 24px ${C.mocha}50`,
            letterSpacing: "0.02em",
          }}
        />
        <p
          style={{
            textAlign: "center",
            marginTop: 14,
            fontSize: 13,
            color: "rgba(255,255,255,0.6)",
            fontFamily: FONT_HEAD,
          }}
        >
          Already have an account?{" "}
          <button
            onClick={() => go("login")}
            style={{
              background: "none",
              border: "none",
              color: C.greenLight,
              fontWeight: 700,
              fontSize: 13,
              fontFamily: FONT_HEAD,
              cursor: "pointer",
            }}
          >
            Sign In
          </button>
        </p>
      </Center>
    </div>
  )
}
function LoginScreen({ go }: { go: (s: Screen) => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const [emailError, setEmailError] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [loginError, setLoginError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const isDesktop = useIsDesktop()

  const validateLogin = () => {
    let valid = true

    setEmailError("")
    setPasswordError("")
    setLoginError("")

    const identifier = email.trim()

    if (!identifier) {
      setEmailError("Email or username is required.")
      valid = false
    } else {
      const looksLikeEmail = identifier.includes("@")

      if (
        looksLikeEmail &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)
      ) {
        setEmailError("Please enter a valid email address.")
        valid = false
      } else if (
        !looksLikeEmail &&
        !/^[a-zA-Z0-9._-]{3,30}$/.test(identifier)
      ) {
        setEmailError("Please enter a valid username.")
        valid = false
      }
    }

    if (!password) {
      setPasswordError("Password is required.")
      valid = false
    }

    return valid
  }

  const handleLogin = async () => {
    // Prevent double-click / duplicate requests
    if (isLoading) return

    if (!validateLogin()) return

    setIsLoading(true)
    setLoginError("")

    try {
      await loginUser({
        identifier: email.trim(),
        password,
      })

      // Only navigate after the API confirms successful login.
      go("dashboard")
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "AUTH_API_NOT_READY"
      ) {
        setLoginError(
          "Login service is not connected yet. Please try again later.",
        )
      } else {
        setLoginError(
          "Incorrect email/username or password.",
        )
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <img
        src="https://images.unsplash.com/photo-1518843875459-f738682238a6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxmcmVzaCUyMGNvbG9yZnVsJTIwZnJ1aXRzJTIwdmVnZXRhYmxlcyUyMGhlYWx0aHklMjBmb29kfGVufDF8fHx8MTc4NjIzOTc1M3ww&ixlib=rb-4.1.0&q=80&w=1080"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: isDesktop
            ? "rgba(5, 25, 14, 0.72)"
            : "rgba(12, 32, 18, 0.82)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          minHeight: "100dvh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          boxSizing: "border-box",
          padding: isDesktop ? "40px 24px" : "20px 28px 40px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: isDesktop ? 560 : 440,
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: isDesktop ? 0 : 10,
              paddingBottom: isDesktop ? 28 : 32,
            }}
          >
            <Logo
              size={isDesktop ? 180 : 200}
              style={{
                borderRadius: 0,
                marginBottom: -12,
                mixBlendMode: "screen",
              }}
            />

            <p
              style={{
                marginTop: "-12px",
                marginBottom: 0,
                fontWeight: 800,
                fontSize: isDesktop ? 30 : 32,
                fontFamily: FONT_HEAD,
                letterSpacing: "-0.01em",
              }}
            >
              <span style={{ color: C.textOnDark }}>Scan</span>
              <span style={{ color: C.greenLight }}>ity</span>
            </p>

            <h2
              style={{
                marginTop: 8,
                marginBottom: 0,
                fontWeight: 800,
                fontSize: isDesktop ? 30 : 26,
                color: C.textOnDark,
                textAlign: "center",
              }}
            >
              Welcome Back!
            </h2>

            <p
              style={{
                fontSize: isDesktop ? 14 : 13,
                color: "rgba(255,255,255,0.7)",
                marginTop: 6,
                marginBottom: 0,
                textAlign: "center",
              }}
            >
              Please login to continue
            </p>
          </div>

          <div>
            <Field
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              }
              placeholder="Email or username"
              type="text"
              value={email}
              onChange={(value) => {
                setEmail(value)
                if (emailError) setEmailError("")
                if (loginError) setLoginError("")
              }}
            />

            {emailError && (
              <p
                style={{
                  marginTop: -8,
                  marginBottom: 12,
                  color: C.statusDanger,
                  fontFamily: FONT_BODY,
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                {emailError}
              </p>
            )}

            <Field
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect
                    x="3"
                    y="11"
                    width="18"
                    height="11"
                    rx="2"
                    ry="2"
                  />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              }
              placeholder="Password"
              type="password"
              value={password}
              onChange={(value) => {
                setPassword(value)
                if (passwordError) setPasswordError("")
                if (loginError) setLoginError("")
              }}
            />

            {passwordError && (
              <p
                style={{
                  marginTop: -8,
                  marginBottom: 12,
                  color: C.statusDanger,
                  fontFamily: FONT_BODY,
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                {passwordError}
              </p>
            )}

            {loginError && (
              <div
                role="alert"
                style={{
                  marginTop: 4,
                  marginBottom: 16,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: C.mochaPale,
                  border: `1px solid ${C.statusDanger}`,
                  color: C.statusDanger,
                  fontFamily: FONT_BODY,
                  fontSize: 12,
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              >
                {loginError}
              </div>
            )}

            <div
              style={{
                textAlign: "right",
                marginTop: 4,
                marginBottom: isDesktop ? 32 : 28,
              }}
            >
              <button
                type="button"
                onClick={() => go("forgotPassword")}
                style={{
                  border: "none",
                  background: "transparent",
                  color: C.greenLight,
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Forgot Password?
              </button>
            </div>

            <PrimaryBtn
              label={
                isLoading ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ display: "block", margin: "0 auto" }}
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="rgba(255,255,255,0.3)"
                      strokeWidth="3"
                      fill="none"
                    />
                    <path
                      d="M21 12a9 9 0 0 0-9-9"
                      stroke="#fff"
                      strokeWidth="3"
                      strokeLinecap="round"
                      fill="none"
                    >
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 12 12"
                        to="360 12 12"
                        dur="0.7s"
                        repeatCount="indefinite"
                      />
                    </path>
                  </svg>
                ) : (
                  "LOGIN"
                )
              }
              onClick={handleLogin}
              color={C.mocha}
              disabled={isLoading}
            />

            <p
              style={{
                textAlign: "center",
                marginTop: 22,
                fontSize: isDesktop ? 14 : 13,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  if (!isLoading) go("register")
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: C.greenLight,
                  fontFamily: FONT_BODY,
                  fontWeight: 500,
                  fontSize: isDesktop ? 14 : 13,
                  cursor: isLoading ? "default" : "pointer",
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                Register
              </button>
            </p>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 6,
              marginTop: isDesktop ? 35 : 24,
            }}
          >
            <div
              style={{
                width: 40,
                height: 3,
                borderRadius: 2,
                background: C.green,
              }}
            />

            <div
              style={{
                width: 12,
                height: 3,
                borderRadius: 2,
                background: C.mocha,
              }}
            />

            <div
              style={{
                width: 6,
                height: 3,
                borderRadius: 2,
                background: C.gray,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function RegisterScreen({ go }: { go: (s: Screen) => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")

  const [nameError, setNameError] = useState("")
  const [emailError, setEmailError] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [confirmError, setConfirmError] = useState("")
  const [registerError, setRegisterError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const isDesktop = useIsDesktop()

  const validateRegistration = () => {
    let valid = true

    setNameError("")
    setEmailError("")
    setPasswordError("")
    setConfirmError("")
    setRegisterError("")

    const trimmedName = name.trim()
    const trimmedEmail = email.trim()

    if (!trimmedName) {
      setNameError("Full name is required.")
      valid = false
    } else if (trimmedName.length < 2) {
      setNameError("Please enter your full name.")
      valid = false
    }

    if (!trimmedEmail) {
      setEmailError("Email is required.")
      valid = false
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
    ) {
      setEmailError("Please enter a valid email address.")
      valid = false
    }

    if (!password) {
      setPasswordError("Password is required.")
      valid = false
    } else if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.")
      valid = false
    } else if (!/\d/.test(password)) {
      setPasswordError("Password must contain at least 1 number.")
      valid = false
    }

    if (!confirm) {
      setConfirmError("Please confirm your password.")
      valid = false
    } else if (password !== confirm) {
      setConfirmError("Passwords do not match.")
      valid = false
    }

    return valid
  }

  const handleRegister = async () => {
    // Prevent double-click / duplicate registration requests
    if (isLoading) return

    if (!validateRegistration()) return

    setIsLoading(true)
    setRegisterError("")

    try {
      await registerUser({
        name: name.trim(),
        email: email.trim(),
        password,
      })

      // Only show success after the API confirms registration.
      go("success")
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "AUTH_API_NOT_READY"
      ) {
        setRegisterError(
          "Registration service is not connected yet. Please try again later.",
        )
      }
      else if (
      error instanceof Error &&
     /already registered|already exists|duplicate|user_already_exists/i.test(
      error.message,
     )
     ) {
    setEmailError("An account with this email already exists.")
     } 
      else {
        setRegisterError(
          "Unable to create your account. Please check your details and try again.",
        )
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <img
        src="https://images.unsplash.com/photo-1518843875459-f738682238a6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxmcmVzaCUyMGNvbG9yZnVsJTIwZnJ1aXRzJTIwdmVnZXRhYmxlcyUyMGhlYWx0aHklMjBmb29kfGVufDF8fHx8MTc4NjIzOTc1M3ww&ixlib=rb-4.1.0&q=80&w=1080"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: isDesktop
            ? "rgba(5, 25, 14, 0.72)"
            : "rgba(12, 32, 18, 0.82)",
        }}
      />

      <Center maxWidth={440}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            paddingTop: 50,
            paddingLeft: 28,
            paddingRight: 28,
            paddingBottom: 36,
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Logo
              size={120}
              style={{ borderRadius: 0, mixBlendMode: "screen" }}
            />

            <p
              style={{
                marginTop: -8,
                fontWeight: 800,
                fontSize: 24,
                fontFamily: FONT_HEAD,
                letterSpacing: "-0.01em",
              }}
            >
              <span style={{ color: C.textOnDark }}>Scan</span>
              <span style={{ color: C.greenLight }}>ity</span>
            </p>
          </div>

          <h2
            style={{
              fontWeight: 800,
              fontSize: 24,
              color: C.textOnDark,
              textAlign: "center",
              marginTop: 0,
              marginBottom: 2,
            }}
          >
            Create Account
          </h2>

          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.6)",
              textAlign: "center",
              marginTop: 4,
              marginBottom: 20,
            }}
          >
            Sign up to get started
          </p>

          <Field
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            }
            placeholder="Full Name"
            value={name}
            onChange={(value) => {
              setName(value)
              if (nameError) setNameError("")
              if (registerError) setRegisterError("")
            }}
          />

          {nameError && (
            <p
              style={{
                marginTop: -8,
                marginBottom: 12,
                color: C.statusDanger,
                fontFamily: FONT_BODY,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {nameError}
            </p>
          )}

          <Field
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            }
            placeholder="Email"
            type="email"
            value={email}
            onChange={(value) => {
              setEmail(value)
              if (emailError) setEmailError("")
              if (registerError) setRegisterError("")
            }}
          />

          {emailError && (
            <p
              style={{
                marginTop: -8,
                marginBottom: 12,
                color: C.statusDanger,
                fontFamily: FONT_BODY,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {emailError}
            </p>
          )}

          <Field
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            }
            placeholder="Password"
            type="password"
            value={password}
            onChange={(value) => {
              setPassword(value)
              if (passwordError) setPasswordError("")
              if (confirmError) setConfirmError("")
              if (registerError) setRegisterError("")
            }}
            hint="Min 8 characters, 1 number"
          />

          {passwordError && (
            <p
              style={{
                marginTop: -8,
                marginBottom: 12,
                color: C.statusDanger,
                fontFamily: FONT_BODY,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {passwordError}
            </p>
          )}

          <Field
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            }
            placeholder="Confirm Password"
            type="password"
            value={confirm}
            onChange={(value) => {
              setConfirm(value)
              if (confirmError) setConfirmError("")
              if (registerError) setRegisterError("")
            }}
          />

          {confirmError && (
            <p
              style={{
                marginTop: -8,
                marginBottom: 12,
                color: C.statusDanger,
                fontFamily: FONT_BODY,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {confirmError}
            </p>
          )}

          {registerError && (
            <div
              role="alert"
              style={{
                marginTop: 4,
                marginBottom: 16,
                padding: "10px 12px",
                borderRadius: 10,
                background: C.mochaPale,
                border: `1px solid ${C.statusDanger}`,
                color: C.statusDanger,
                fontFamily: FONT_BODY,
                fontSize: 12,
                fontWeight: 500,
                lineHeight: 1.4,
              }}
            >
              {registerError}
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <PrimaryBtn
              label={
                isLoading ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ display: "block", margin: "0 auto" }}
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="rgba(255,255,255,0.3)"
                      strokeWidth="3"
                      fill="none"
                    />
                    <path
                      d="M21 12a9 9 0 0 0-9-9"
                      stroke="#fff"
                      strokeWidth="3"
                      strokeLinecap="round"
                      fill="none"
                    >
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 12 12"
                        to="360 12 12"
                        dur="0.7s"
                        repeatCount="indefinite"
                      />
                    </path>
                  </svg>
                ) : (
                  "Register"
                )
              }
              onClick={handleRegister}
              color={C.mocha}
              disabled={isLoading}
            />
          </div>

          <p
            style={{
              textAlign: "center",
              marginTop: 16,
              fontSize: 13,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => {
                if (!isLoading) go("login")
              }}
              style={{
                background: "none",
                border: "none",
                color: C.greenLight,
                fontFamily: FONT_BODY,
                fontWeight: 600,
                fontSize: 13,
                cursor: isLoading ? "default" : "pointer",
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              Login
            </button>
          </p>
        </div>
      </Center>
    </div>
  )
}

function SuccessScreen({ go }: { go: (s: Screen) => void }) {
  const isDesktop = useIsDesktop()
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background: "#0C2012",
      }}
    >
      {/* Background */}
      <img
        src="https://images.unsplash.com/photo-1518843875459-f738682238a6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxmcmVzaCUyMGNvbG9yZnVsJTIwZnJ1aXRzJTIwdmVnZXRhYmxlcyUyMGhlYWx0aHklMjBmb29kfGVufDF8fHx8MTc4NjIzOTc1M3ww&ixlib=rb-4.1.0&q=80&w=1080"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />
      {/* Dark overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(8,25,14,0.88) 0%, rgba(12,32,18,0.92) 100%)",
        }}
      />
      {/* Content */}
      <Center
        maxWidth={480}
        style={{
          flex: 1,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: isDesktop ? "40px 24px" : "20px 28px 40px",
          position: "relative",
          zIndex: 1,
          boxSizing: "border-box",
        }}
      >
        {/* Success Icon */}
        <div
          style={{
            width: 116,
            height: 116,
            borderRadius: "50%",
            border: "8px solid rgba(224,167,46,0.16)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 45,
            marginTop: 5,
          }}
        >
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: "50%",
              background: C.greenLight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 30px rgba(224,167,46,0.35)",
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
        {/* Title */}
        <h2
          style={{
            fontWeight: 800,
            fontSize: 25,
            color: C.textOnDark,
            textAlign: "center",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Registration Successful!
        </h2>
        {/* Subtitle */}
        <p
          style={{
            fontSize: 14,
            color: C.greenLight,
            textAlign: "center",
            margin: "10px 0 0",
            lineHeight: 1.5,
            fontWeight: 500,
          }}
        >
          Let's personalize your nutrition experience.
        </p>
        <div
          style={{
            width: "100%",
            marginTop: 30,
            padding: "18px 18px",
            borderRadius: 20,
            background: "rgba(255, 255, 255, 0.10)",
            border: "1px solid rgba(255, 255, 255, 0.16)",
            boxSizing: "border-box",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              minWidth: 44,
              borderRadius: 12,
              background: "rgba(125, 194, 66, 0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 14px rgba(224,167,46,0.08)",
              marginBottom: 14,
            }}
          >
            <svg
              width="25"
              height="25"
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.greenLight}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3L5 6v5c0 4.5 2.9 8.3 7 9.5 4.1-1.2 7-5 7-9.5V6l-7-3z" />
              <path d="M8.5 12l2.2 2.2 4.8-5" />
            </svg>
          </div>
          <p
            style={{
              flex: 1,
              margin: 0,
              fontSize: 13,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.86)",
              textAlign: "left",
              fontWeight: 400,
            }}
          >
            Before you start scanning, tell us about your allergies and health
            conditions so we can provide better nutrition insights tailored to
            you.
          </p>
        </div>
        <div
          style={{
            width: "100%",
            marginTop: 26,
          }}
        >
          <PrimaryBtn
            label="Get Started"
            onClick={() => go("allergies")}
            color={C.green}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginTop: 24,
          }}
        >
          <div
            style={{
              width: 24,
              height: 5,
              borderRadius: 10,
              background: C.greenLight,
            }}
          />
          <div
            style={{
              width: 7,
              height: 5,
              borderRadius: 10,
              background: "rgba(255,255,255,0.25)",
            }}
          />
          <div
            style={{
              width: 7,
              height: 5,
              borderRadius: 10,
              background: "rgba(255,255,255,0.25)",
            }}
          />
        </div>
      </Center>
    </div>
  )
}
const ALLERGY_LIST = [
  { id: "peanuts", label: "Peanuts", icon: "https://api.iconify.design/openmoji/peanuts.svg", iconBg: "#B5834A" },
  { id: "tree-nuts", label: "Tree Nuts", icon: "https://api.iconify.design/openmoji/chestnut.svg", iconBg: "#C4574B" },
  { id: "dairy", label: "Dairy", icon: "https://api.iconify.design/openmoji/glass-of-milk.svg", iconBg: "#4A90C4" },
  { id: "eggs", label: "Eggs", icon: "https://api.iconify.design/openmoji/egg.svg", iconBg: "#E0A72E" },
  { id: "wheat", label: "Wheat / Gluten", icon: "https://api.iconify.design/openmoji/sheaf-of-rice.svg", iconBg: "#6B9E4A" },
  { id: "soy", label: "Soy", icon: "https://api.iconify.design/openmoji/beans.svg", iconBg: "#C45B8A" },
  { id: "fish", label: "Fish", icon: "https://api.iconify.design/openmoji/fish.svg", iconBg: "#4A90C4" },
  { id: "shellfish", label: "Shellfish", icon: "https://api.iconify.design/openmoji/shrimp.svg", iconBg: "#C4574B" },
  { id: "sesame", label: "Sesame", icon: "https://api.iconify.design/openmoji/herb.svg", iconBg: "#6B9E4A" },
  { id: "other", label: "Other", icon: "https://api.iconify.design/openmoji/plus.svg", iconBg: "#8A6FC4" },
]
function AllergiesScreen({ go }: { go: (s: Screen) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(["peanuts"]))
  const [otherText, setOtherText] = useState("")
  const [buttonActive, setButtonActive] = useState(false)
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <img
        src="https://images.unsplash.com/photo-1518843875459-f738682238a6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxmcmVzaCUyMGNvbG9yZnVsJTIwZnJ1aXRzJTIwdmVnZXRhYmxlcyUyMGhlYWx0aHklMjBmb29kfGVufDF8fHx8MTc4NjIzOTc1M3ww&ixlib=rb-4.1.0&q=80&w=1080"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(12,32,18,0.82)",
        }}
      />
      <Center
        maxWidth={560}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 1,
          paddingTop: SAFE_TOP,
        }}
      >
        <div style={{ padding: "16px 28px 20px", textAlign: "center" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 14,
              marginTop: 50,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.1)",
                border: "2px solid rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke={C.textOnDark}
                strokeWidth="1.8"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path
                  d="M9 12l2 2 4-4"
                  stroke={C.greenLight}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <h2 style={{ fontWeight: 800, fontSize: 22, color: C.textOnDark }}>
            Select your allergies
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.6)",
              marginTop: 6,
            }}
          >
            Choose all that apply to you.
          </p>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              paddingBottom: 16,
            }}
          >
            {ALLERGY_LIST.filter((i) => i.id !== "other").map((item) => {
              const active = selected.has(item.id)
              return (
                <div
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 999,
                    border: `1.5px solid ${
                      active ? C.green : "rgba(255,255,255,0.15)"
                    }`,
                    background: active
                      ? "rgba(224,167,46,0.2)"
                      : "rgba(255,255,255,0.05)",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                  }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: item.iconBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={item.icon}
                      alt=""
                      width={16}
                      height={16}
                      style={{ filter: "brightness(0) invert(1)" }}
                    />
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: FONT_BODY,
                      fontWeight: 500,
                      fontSize: 13,
                      color: C.textOnDark,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.label}
                  </span>
                  {active && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      style={{ flexShrink: 0 }}
                    >
                      <polyline
                        points="12 3 5.5 10 2 6.5"
                        stroke={C.textOnDark}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              )
            })}
            <div
              onClick={() => toggle("other")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 999,
                border: `1.5px solid ${
                  selected.has("other") ? C.green : "rgba(255,255,255,0.15)"
                }`,
                background: selected.has("other")
                  ? "rgba(224,167,46,0.2)"
                  : "rgba(255,255,255,0.05)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                cursor: "pointer",
                transition: "all 0.18s ease",
                gridColumn: "1 / -1",
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "#8A6FC4",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <img
                  src="https://api.iconify.design/openmoji/plus.svg"
                  alt=""
                  width={16}
                  height={16}
                  style={{ filter: "brightness(0) invert(1)" }}
                />
              </span>
              {selected.has("other") ? (
                <input
                  autoFocus
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Please specify"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    fontFamily: FONT_BODY,
                    fontWeight: 500,
                    fontSize: 13,
                    color: C.textOnDark,
                  }}
                />
              ) : (
                <span
                  style={{
                    flex: 1,
                    fontFamily: FONT_BODY,
                    fontWeight: 500,
                    fontSize: 13,
                    color: C.textOnDark,
                  }}
                >
                  Other
                </span>
              )}
            </div>
          </div>
        </div>
        <div
          style={{
            padding: "14px 24px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: FONT_BODY,
              fontWeight: 600,
              fontSize: 13,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {selected.size} selected
          </span>
          <button
            onClick={() => go("health")}
            onMouseEnter={() => setButtonActive(true)}
            onMouseLeave={() => setButtonActive(false)}
            style={{
              flex: 1,
              maxWidth: 200,
              padding: "14px",
              borderRadius: 14,
              border: "none",
              background: buttonActive ? C.mochaDark : C.mocha,
              color: C.white,
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              boxShadow: `0 4px 14px ${C.mocha}44`,
            }}
          >
            Continue
          </button>
        </div>
      </Center>
    </div>
  )
}
const HEALTH_LIST = [
  { id: "diabetes", label: "Diabetes", icon: "https://api.iconify.design/openmoji/drop-of-blood.svg", iconBg: "#C4574B" },
  { id: "hypertension", label: "Hypertension", icon: "https://api.iconify.design/openmoji/red-heart.svg", iconBg: "#C45B8A" },
  { id: "celiac", label: "Celiac Disease", icon: "https://api.iconify.design/openmoji/sheaf-of-rice.svg", iconBg: "#6B9E4A" },
  { id: "lactose", label: "Lactose Intolerance", icon: "https://api.iconify.design/openmoji/glass-of-milk.svg", iconBg: "#4A90C4" },
  { id: "ibs", label: "IBS / Crohn's", icon: "https://api.iconify.design/openmoji/lungs.svg", iconBg: "#B5834A" },
  { id: "kidney", label: "Kidney Disease", icon: "https://api.iconify.design/openmoji/kidney.svg", iconBg: "#8A6FC4" },
  { id: "heart", label: "Heart Disease", icon: "https://api.iconify.design/openmoji/pill.svg", iconBg: "#E0A72E" },
  { id: "none", label: "None of the above", icon: "https://api.iconify.design/openmoji/check-mark.svg", iconBg: "#6B9E4A" },
]
function HealthScreen({ go }: { go: (s: Screen) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [otherText, setOtherText] = useState("")
  const [buttonActive, setButtonActive] = useState(false)
  const toggle = (item: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(item)) {
        next.delete(item)
      } else {
        next.add(item)
      }
      return next
    })
  }
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <img
        src="https://images.unsplash.com/photo-1518843875459-f738682238a6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(12,32,18,0.82)",
        }}
      />
      <Center
        maxWidth={560}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 1,
          paddingTop: SAFE_TOP,
        }}
      >
        <div
          style={{
            padding: "16px 28px 20px",
            textAlign: "center",
            marginTop:50,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.1)",
                border: "2px solid rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke={C.textOnDark}
                strokeWidth="1.8"
              >
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                <path
                  d="M12 8v4M12 16h.01"
                  stroke={C.greenLight}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
          <h2
            style={{
              fontWeight: 800,
              fontSize: 22,
              color: C.textOnDark,
              margin: 0,
            }}
          >
            Select health conditions
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.6)",
              marginTop: 6,
            }}
          >
            Choose all that apply to you.
          </p>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 16px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              paddingBottom: 16,
            }}
          >
            {HEALTH_LIST.map((item) => {
              const active = selected.has(item.id)
              return (
                <div
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 999,
                    border: `1.5px solid ${
                      active ? C.green : "rgba(255,255,255,0.15)"
                    }`,
                    background: active
                      ? "rgba(224,167,46,0.2)"
                      : "rgba(255,255,255,0.05)",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                  }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: item.iconBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={item.icon}
                      alt=""
                      width={16}
                      height={16}
                      style={{ filter: "brightness(0) invert(1)" }}
                    />
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: FONT_BODY,
                      fontWeight: 500,
                      fontSize: 13,
                      color: C.textOnDark,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.label}
                  </span>
                  {active && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      style={{ flexShrink: 0 }}
                    >
                      <polyline
                        points="12 3 5.5 10 2 6.5"
                        stroke={C.textOnDark}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              )
            })}
            <div
              onClick={() => toggle("other")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 999,
                border: `1.5px solid ${
                  selected.has("other") ? C.green : "rgba(255,255,255,0.15)"
                }`,
                background: selected.has("other")
                  ? "rgba(224,167,46,0.2)"
                  : "rgba(255,255,255,0.05)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                cursor: "pointer",
                transition: "all 0.18s ease",
                gridColumn: "1 / -1",
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "#8A6FC4",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <img
                  src="https://api.iconify.design/openmoji/plus.svg"
                  alt=""
                  width={16}
                  height={16}
                  style={{ filter: "brightness(0) invert(1)" }}
                />
              </span>
              {selected.has("other") ? (
                <input
                  autoFocus
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Please specify"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    fontFamily: FONT_BODY,
                    fontWeight: 500,
                    fontSize: 13,
                    color: C.textOnDark,
                  }}
                />
              ) : (
                <span
                  style={{
                    flex: 1,
                    fontFamily: FONT_BODY,
                    fontWeight: 500,
                    fontSize: 13,
                    color: C.textOnDark,
                  }}
                >
                  Other
                </span>
              )}
            </div>
          </div>
        </div>
        <div
          style={{
            padding: "14px 24px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: FONT_BODY,
              fontWeight: 600,
              fontSize: 13,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {selected.size} selected
          </span>
          <button
            onClick={() => go("loading")}
            onMouseEnter={() => setButtonActive(true)}
            onMouseLeave={() => setButtonActive(false)}
            style={{
              flex: 1,
              maxWidth: 200,
              padding: "14px",
              borderRadius: 14,
              border: "none",
              background: buttonActive ? C.mochaDark : C.mocha,
              color: C.white,
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              boxShadow: `0 4px 14px ${C.mocha}44`,
            }}
          >
            Continue
          </button>
        </div>
      </Center>
    </div>
  )
}
function LoadingScreen({ go }: { go: (s: Screen) => void }) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }

        return prev + 1
      })
    }, 45)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (progress >= 100) {
      const timer = setTimeout(() => {
        go("allset")
      }, 700)

      return () => clearTimeout(timer)
    }
  }, [progress, go])

  const r = 54
  const circ = 2 * Math.PI * r
  const offset = circ - (progress / 100) * circ

  const currentStep =
    progress < 35
      ? 0
      : progress < 70
        ? 1
        : 2

  const loadingText =
    progress < 35
      ? "Setting up your profile…"
      : progress < 70
        ? "Analyzing your preferences…"
        : progress < 100
          ? "Preparing recommendations…"
          : "You're all set!"

  const loadingSubtext =
    progress < 35
      ? "Creating your personalized profile."
      : progress < 70
        ? "Checking your allergies and health preferences."
        : progress < 100
          ? "Finding recommendations that match you."
          : "Your personalized experience is ready."

  const steps = [
    {
      label: "Setting up your profile",
    },
    {
      label: "Analyzing your preferences",
    },
    {
      label: "Preparing recommendations",
    },
  ]

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background image */}
      <img
        src="https://images.unsplash.com/photo-1518843875459-f738682238a6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxmcmVzaCUyMGNvbG9yZnVsJTIwZnJ1aXRzJTIwdmVnZXRhYmxlcyUyMGhlYWx0aHklMjBmb29kfGVufDF8fHx8MTc4NjIzOTc1M3ww&ixlib=rb-4.1.0&q=80&w=1080"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />

      {/* Dark overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(12,32,18,0.84)",
        }}
      />

      <Center
        maxWidth={480}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 32px",
          gap: 30,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Circular loading */}
        <div
          style={{
            position: "relative",
            width: 140,
            height: 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="140"
            height="140"
            style={{
              position: "absolute",
              transform: "rotate(-90deg)",
            }}
          >
            {/* Background circle */}
            <circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="10"
            />

            {/* Progress circle */}
            <circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={C.greenLight}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              style={{
                transition: "stroke-dashoffset 0.15s ease",
              }}
            />
          </svg>

          <span
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 32,
              color: C.textOnDark,
            }}
          >
            {progress}%
          </span>
        </div>

        {/* Loading text */}
        <div
          style={{
            textAlign: "center",
            minHeight: 75,
          }}
        >
          <h2
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 22,
              color: C.textOnDark,
              margin: 0,
              marginBottom: 8,
            }}
          >
            {loadingText}
          </h2>

          <p
            style={{
              fontFamily: FONT_BODY,
              fontSize: 13,
              color: "rgba(255,255,255,0.62)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {loadingSubtext}
          </p>
        </div>

        {/* Steps */}
        <div
          style={{
            width: "100%",
            padding: "0 8px",
          }}
        >
          {/* Circles and connecting lines */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
            }}
          >
            {steps.map((step, i) => {
              const done = progress >= [35, 70, 100][i]
              const active = currentStep === i && !done

              return (
                <Fragment key={i}>
                  {/* Step circle */}
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: done
                        ? C.greenLight
                        : active
                          ? "rgba(125,194,66,0.25)"
                          : "rgba(255,255,255,0.12)",
                      border: active
                        ? `2px solid ${C.greenLight}`
                        : "2px solid transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 0.3s ease",
                      boxSizing: "border-box",
                    }}
                  >
                    {done ? (
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 15 15"
                        fill="none"
                      >
                        <polyline
                          points="12.5 3.5 6 11 2.5 7.5"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : active ? (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: C.greenLight,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: "rgba(255,255,255,0.3)",
                        }}
                      />
                    )}
                  </div>

                  {/* Connecting line */}
                  {i < steps.length - 1 && (
                    <div
                      style={{
                        flex: 1,
                        height: 3,
                        background: "rgba(255,255,255,0.12)",
                        borderRadius: 2,
                        margin: "0 5px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width:
                            progress >= [35, 70][i]
                              ? "100%"
                              : progress >= [0, 35][i]
                                ? "45%"
                                : "0%",
                          background: C.greenLight,
                          borderRadius: 2,
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>

          {/* Step labels */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 10,
            }}
          >
            {steps.map((step, i) => {
              const done = progress >= [35, 70, 100][i]
              const active = currentStep === i && !done

              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    textAlign:
                      i === 0
                        ? "left"
                        : i === steps.length - 1
                          ? "right"
                          : "center",
                    padding:
                      i === 0
                        ? "0 2px 0 0"
                        : i === steps.length - 1
                          ? "0 0 0 2px"
                          : "0 2px",
                  }}
                >
                  <p
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 9,
                      color: done || active
                        ? C.greenLight
                        : "rgba(255,255,255,0.4)",
                      lineHeight: 1.4,
                      margin: 0,
                      transition: "color 0.3s ease",
                    }}
                  >
                    {step.label}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Loading indicator */}
        {progress < 100 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: C.greenLight,
                animation: "loadingPulse 1s ease-in-out infinite",
              }}
            />

            <span
              style={{
                fontFamily: FONT_BODY,
                fontSize: 11,
                color: "rgba(255,255,255,0.45)",
              }}
            >
              Please wait...
            </span>
          </div>
        )}

        {/* Finished message */}
        {progress >= 100 && (
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 14,
              color: C.greenLight,
              fontWeight: 700,
              marginTop: 4,
            }}
          >
            Taking you to your dashboard...
          </div>
        )}

        {/* Animations */}
        <style>{`
          @keyframes loadingPulse {
            0%, 100% {
              opacity: 0.3;
              transform: scale(0.8);
            }
            50% {
              opacity: 1;
              transform: scale(1.2);
            }
          }
        `}</style>
      </Center>
    </div>
  )
}
function AllSetScreen({ go }: { go: (s: Screen) => void }) {
  const checks = [
    "Allergies saved",
    "Health conditions saved",
    "Personalization complete",
  ]
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <img
        src="https://images.unsplash.com/photo-1518843875459-f738682238a6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxmcmVzaCUyMGNvbG9yZnVsJTIwZnJ1aXRzJTIwdmVnZXRhYmxlcyUyMGhlYWx0aHklMjBmb29kfGVufDF8fHx8MTc4NjIzOTc1M3ww&ixlib=rb-4.1.0&q=80&w=1080"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(12,32,18,0.82)",
        }}
      />
      <Center
        maxWidth={480}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 32px",
          gap: 24,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: C.greenLight,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 32px rgba(224,167,46,0.45)",
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
              fill="rgba(255,255,255,0.15)"
              stroke="white"
              strokeWidth="1.5"
            />
            <polyline
              points="9 12 11 14 15 10"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <h2
            style={{
              fontWeight: 700,
              fontSize: 26,
              color: C.textOnDark,
              marginTop: 0,
              marginBottom: 8,
            }}
          >
            You're all set!
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.6)",
              marginTop: 0,
              lineHeight: 1.6,
            }}
          >
            We'll now provide personalized
            <br />
            nutrition insights just for you.
          </p>
        </div>
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {checks.map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 18px",
                borderRadius: 14,
                background: "rgba(255,255,255,0.08)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                border: "1.5px solid rgba(224,167,46,0.4)",
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: C.greenLight,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <polyline
                    points="10 3 5 9 2 6"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontWeight: 500,
                  fontSize: 14,
                  color: C.textOnDark,
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
        <div style={{ width: "100%" }}>
          <PrimaryBtn
            label="Go to Dashboard"
            onClick={() => go("dashboard")}
            color={C.mocha}
          />
        </div>
      </Center>
    </div>
  )
}
// Single source of truth for every scan record shown on the Dashboard panel
// and the full Scan History page. Fields are kept to what the SCAN_HISTORIES
// table actually tracks (product, scan_date, scan_method) plus a local
// `favorite` flag for the Favourite filter and an `imageUrl` for the thumb —
// nothing invented beyond that.
type ScanMethod = "Barcode" | "OCR"
type ScanRecord = {
  name: string
  date: string
  time: string
  score: number
  method: ScanMethod
  favorite?: boolean
  imageUrl?: string
}
const RECENT_SCANS: ScanRecord[] = [
  { name: "Milk", date: "Aug 9, 2026", time: "7:04 AM", score: 87, method: "Barcode", favorite: true, imageUrl: milkImg },
  { name: "Orange Juice", date: "Aug 8, 2026", time: "6:30 PM", score: 72, method: "Barcode", imageUrl: orangeJuiceImg },
  { name: "Chocolate Bar", date: "Aug 7, 2026", time: "3:12 PM", score: 58, method: "OCR", imageUrl: chocolateBarImg },
  { name: "Corn Flakes", date: "Aug 6, 2026", time: "8:05 AM", score: 81, method: "Barcode", imageUrl: cornflakesImg },
  { name: "Potato Chips", date: "Aug 5, 2026", time: "1:20 PM", score: 64, method: "OCR", imageUrl: potatoChipsImg },
  { name: "Yogurt", date: "Aug 5, 2026", time: "9:10 AM", score: 91, method: "Barcode", favorite: true, imageUrl: yogurtImg },
  { name: "Instant Noodles", date: "Aug 3, 2026", time: "12:40 PM", score: 55, method: "Barcode", imageUrl: beefNoodlesImg },
  { name: "Tuna Sandwich", date: "Aug 2, 2026", time: "11:15 AM", score: 84, method: "OCR", favorite: true, imageUrl: tunaSandwichImg },
]
// Colors are the same Soft Slate status hues DashboardIconRail's logout icon
// and the Dashboard's own Scan History panel use (SOFT_SLATE.green/caution/
// unsafe), so a score reads the same way on both screens.
function scanStatusInfo(score: number): { label: string; color: string; bg: string } {
  if (score >= 71) return { label: "Safe", color: SOFT_SLATE.green, bg: "#E1EBE5" }
  if (score >= 42) return { label: "Caution", color: SOFT_SLATE.caution, bg: "#F1E3D8" }
  return { label: "Avoid", color: SOFT_SLATE.unsafe, bg: "#F1DEDA" }
}
// ── "1a Grouped activity list" ───────────────────────────────────────────────
// Scan History layout direction: date sections, one panel per group, hairline
// dividers between rows. RECENT_SCANS is already newest-first, so the first
// distinct date present reads as "Today", the next as "Yesterday", and every
// older date collapses into one combined "Earlier" section (grouping is based
// on the data's own chronology rather than the wall clock, since these are
// fixed demo dates). Rows inside "Earlier" keep showing their date, since the
// section header no longer states it for them.
const SCAN_DATE_ORDER = Array.from(new Set(RECENT_SCANS.map((scan) => scan.date)))
function scanDateGroupLabel(date: string): string {
  const index = SCAN_DATE_ORDER.indexOf(date)
  if (index === 0) return "Today"
  if (index === 1) return "Yesterday"
  return "Earlier"
}
type ScanGroup = { label: string; showDate: boolean; scans: ScanRecord[] }
function groupScans(scans: ScanRecord[]): ScanGroup[] {
  const groups: ScanGroup[] = []
  for (const scan of scans) {
    const label = scanDateGroupLabel(scan.date)
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.scans.push(scan)
    } else {
      groups.push({ label, showDate: label === "Earlier", scans: [scan] })
    }
  }
  return groups
}
// Row used by the "1a Grouped activity list" Scan History page. The whole
// row is the tap target; the trailing chevron is the visible "view detail"
// affordance. `showDate` is turned off inside a "Today"/"Yesterday" group,
// where the section header already says which day it is — the "Earlier"
// group keeps the default of showing it. `isLast` drops the hairline
// divider for the final row in a group panel, so the panel's own bottom
// edge stays clean instead of doubling up with a divider.
function ScanRow({
  scan,
  onView,
  showDate = true,
  isLast = false,
}: {
  scan: ScanRecord
  onView: () => void
  showDate?: boolean
  isLast?: boolean
}) {
  const status = scanStatusInfo(scan.score)
  return (
    <button
      type="button"
      onClick={onView}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 6px",
        background: "none",
        border: "none",
        borderBottom: isLast ? "none" : "1px solid rgba(198,204,212,0.6)",
        boxSizing: "border-box",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: SOFT_SLATE.thumbBg,
          boxShadow: SOFT_SLATE.insetSm,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {scan.imageUrl ? (
          <img src={scan.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <i className="fa fa-cube" style={{ fontSize: 15, color: SOFT_SLATE.textMuted }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <p
            style={{
              margin: 0,
              fontFamily: SOFT_SLATE.fontFamily,
              fontWeight: 700,
              fontSize: 12.5,
              color: SOFT_SLATE.textPrimary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {scan.name}
          </p>
          {scan.favorite && (
            <i className="fa fa-star" aria-label="Favorite" style={{ fontSize: 9.5, color: SOFT_SLATE.gold, flexShrink: 0 }} />
          )}
        </div>
        <p
          style={{
            margin: "2px 0 0",
            fontFamily: SOFT_SLATE.fontFamily,
            fontSize: 9.5,
            color: SOFT_SLATE.textMuted,
          }}
        >
          {showDate ? `${scan.date} • ${scan.time} · ${scan.method}` : `${scan.time} · ${scan.method}`}
        </p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "1px 8px",
            borderRadius: 999,
            fontFamily: SOFT_SLATE.fontFamily,
            fontWeight: 700,
            fontSize: 8.5,
            color: status.color,
            background: status.bg,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: status.color,
              flexShrink: 0,
            }}
          />
          {status.label}
        </span>
        <p
          style={{
            margin: "4px 0 0",
            fontFamily: SOFT_SLATE.fontFamily,
            fontWeight: 800,
            fontSize: 15,
            color: status.color,
            lineHeight: 1,
          }}
        >
          {scan.score}
        </p>
      </div>
      <i
        className="fa fa-angle-right"
        aria-label="View details"
        style={{ fontSize: 14, color: SOFT_SLATE.textMuted, flexShrink: 0, marginLeft: 2 }}
      />
    </button>
  )
}
// ── Dashboard Screen ──────────────────────────────────────────────────────────
// ── Soft Slate (neumorphic) design tokens — DASHBOARD ONLY ─────────────────────
// Originally scoped to the Dashboard screen only, per the "1a Soft Slate —
// extruded rail, raised cards" direction from the design exploration. Scan
// History now opts into the same tokens too (by request, to match Dashboard's
// shading) — every other screen still keeps the app's normal PALETTE/theme,
// so don't reach for these elsewhere without a similar explicit reason.
const SOFT_SLATE = {
  bg: "#e9edf2",
  raisedLg: "9px 9px 22px #c6ccd4, -9px -9px 22px #ffffff",
  raisedMd: "8px 8px 20px #c6ccd4, -8px -8px 20px #ffffff",
  raisedSm: "5px 5px 12px #c6ccd4, -5px -5px 12px #ffffff",
  raisedBtn: "6px 6px 14px #c6ccd4, -4px -4px 10px #ffffff",
  raisedBtnAlt: "6px 6px 14px #c6ccd4, -6px -6px 14px #ffffff",
  raisedIconWell: "4px 4px 10px #c0a06a, -3px -3px 8px #ffffff",
  insetLg: "inset 7px 7px 15px #c6ccd4, inset -7px -7px 15px #ffffff",
  insetMd: "inset 5px 5px 11px #c6ccd4, inset -5px -5px 11px #ffffff",
  insetSm: "inset 3px 3px 7px #c6ccd4, inset -3px -3px 7px #ffffff",
  textPrimary: "#24292f",
  textSecondary: "#565d64",
  textMuted: "#5f666d",
  green: "#1e6b3f",
  gold: "#d8a02a",
  caution: "#b8501f",
  unsafe: "#c23a1f",
  barDark: "#2b3138",
  thumbBg: "#dfe4ea",
  fontFamily: `Archivo, ${FONT_BODY}`,
}

// ── Dashboard icon rail — 80px, icon-only, own palette ──────────────────────────
// Replaces AppSidebar on the Dashboard only (per user's "dashboard only" scope
// decision). Always visible — no mobile drawer/overlay, it's slim enough to
// stay put at any width. The Scanity wordmark/tagline live in the greeting
// header instead of the rail.
// Default nav set for DashboardIconRail — Dashboard's own four links. Scan
// History passes its own SCAN_HISTORY_RAIL_ITEMS (below) instead, via the
// `navItems` prop, so this default and Dashboard's call sites are untouched.
const DASHBOARD_RAIL_ITEMS: {
  screen: Screen
  label: string
  path: ReactNode
}[] = [
  {
    screen: "dashboard",
    label: "Dashboard",
    path: (
      <>
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M9 22V12h6v10" />
      </>
    ),
  },
  {
    screen: "settings",
    label: "Settings",
    path: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
      </>
    ),
  },
  {
    screen: "help",
    label: "Help & FAQ",
    path: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </>
    ),
  },
  {
    screen: "about",
    label: "About",
    path: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </>
    ),
  },
]

// Same clock glyph style as the rest of this rail's Lucide-style icons, used
// by Scan History's SCAN_HISTORY_RAIL_ITEMS below.
const CLOCK_ICON_PATH: ReactNode = (
  <>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </>
)

// Scan History reuses Dashboard's own rail (same shading, same shell) with
// its own nav set: Dashboard, a "Scan History" entry the full sidebar has
// never linked to directly, then the same Settings/Help/About as elsewhere.
const SCAN_HISTORY_RAIL_ITEMS: {
  screen: Screen
  label: string
  path: ReactNode
}[] = [
  DASHBOARD_RAIL_ITEMS[0],
  { screen: "history", label: "Scan History", path: CLOCK_ICON_PATH },
  DASHBOARD_RAIL_ITEMS[1],
  DASHBOARD_RAIL_ITEMS[2],
  DASHBOARD_RAIL_ITEMS[3],
]

function DashboardIconRail({
  go,
  isDesktop,
  active = "dashboard",
  navItems = DASHBOARD_RAIL_ITEMS,
}: {
  go: (s: Screen) => void
  isDesktop: boolean
  active?: Screen
  navItems?: {
    screen: Screen
    label: string
    path: ReactNode
  }[]
}) {
  return (
    <div
      style={{
        width: isDesktop ? 80 : "100%",
        height: isDesktop ? "100%" : 72,
        flex: "none",
        background: SOFT_SLATE.bg,
        borderRadius: 26,
        padding: isDesktop ? "36px 0 6px" : "0 18px",
        display: "flex",
        flexDirection: isDesktop ? "column" : "row",
        alignItems: "center",
        justifyContent: isDesktop ? "flex-start" : "space-between",
        gap: isDesktop ? 32 : 20,
        boxShadow: SOFT_SLATE.raisedLg,
        fontFamily: SOFT_SLATE.fontFamily,
        boxSizing: "border-box",
      }}
    >
      {/* Brand leaf mark */}
      <Tooltip label="Scanity">
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            background: SOFT_SLATE.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: SOFT_SLATE.raisedSm,
            flexShrink: 0,
          }}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke={SOFT_SLATE.green}
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
          </svg>
        </div>
      </Tooltip>

      {/* Nav icons */}
      <div
        style={{
          display: "flex",
          flexDirection: isDesktop ? "column" : "row",
          alignItems: "center",
          gap: isDesktop ? 20 : 12,
          flex: isDesktop ? undefined : 1,
          justifyContent: isDesktop ? undefined : "center",
        }}
      >
        {navItems.map((item) => {
          const isActive = item.screen === active
          return (
            <Tooltip key={item.screen} label={item.label}>
              <button
                type="button"
                onClick={() => go(item.screen)}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  border: "none",
                  background: isActive ? SOFT_SLATE.bg : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: isActive ? SOFT_SLATE.insetMd : "none",
                }}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isActive ? SOFT_SLATE.green : SOFT_SLATE.textMuted}
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  {item.path}
                </svg>
              </button>
            </Tooltip>
          )
        })}
      </div>

      {/* Divider — sits right above logout; the auto top-margin here (not on
          logout) is what pushes this whole bottom group down to the bottom
          of the rail, so the divider and the logout icon stay right next to
          each other instead of drifting apart. */}
      {isDesktop && (
        <div
          style={{
            width: 32,
            height: 1,
            background: "#c6ccd4",
            margin: "auto 0 8px",
            flexShrink: 0,
          }}
        />
      )}

      {/* Logout — pinned to the bottom of the rail, right under the divider */}
      <Tooltip label="Log out">
        <button
          type="button"
          onClick={() => go("splash")}
          aria-label="Log out"
          style={{
            marginTop: 0,
            flexShrink: 0,
            width: 42,
            height: 42,
            borderRadius: 14,
            border: "none",
            background: SOFT_SLATE.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: SOFT_SLATE.raisedSm,
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke={SOFT_SLATE.caution}
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
      </Tooltip>
    </div>
  )
}

function DashboardScreen({ go }: { go: (s: Screen) => void }) {
  const isDesktop = useIsDesktop()

  const actionCards: {
    label: string
    description: string
    action: () => void
    path: ReactNode
  }[] = [
    {
      label: "Scan OCR",
      description: "Read the label when there is no barcode.",
      action: () => go("ocr"),
      path: (
        <>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v5h6" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </>
      ),
    },
    {
      label: "Compare Products",
      description: "Put two items side by side.",
      action: () => go("productCompare"),
      path: (
        <>
          <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
          <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
          <path d="M7 21h10" />
          <path d="M12 3v18" />
          <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
        </>
      ),
    },
  ]

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background: SOFT_SLATE.bg,
      }}
    >
      {/* ── Icon rail ───────────────────────────────────────────────────── */}
      {/* Pinned to the viewport (position: fixed), not inside the scrolling
          content — same trick AppSidebar uses elsewhere in the app — so it
          stays put in place while the content next to it scrolls, instead of
          scrolling away with it. Stretches to the bottom of the viewport
          (top:26 to bottom:26) so it reaches all the way down, with the nav
          icons up top and logout pushed to the very bottom via marginTop:
          "auto". Desktop only; it's the only nav (settings/help/about/logout)
          Dashboard has now that AppSidebar's mobile drawer has been replaced
          here, so on mobile it renders inline as a horizontal bar instead
          (below). */}
      {isDesktop && (
        <div
          style={{
            position: "fixed",
            top: 22,
            left: 26,
            bottom: 22,
            width: 80,
            zIndex: 5,
          }}
        >
          <DashboardIconRail go={go} isDesktop />
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          paddingTop: SAFE_TOP,
          boxSizing: "border-box",
          marginLeft: isDesktop ? 80 + 26 + 26 : 0,
        }}
      >
        <Center maxWidth={isDesktop ? 1420 - (80 + 26 + 26) : undefined}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 22,
              padding: isDesktop ? "26px 40px 26px 0" : "16px 14px",
              boxSizing: "border-box",
              fontFamily: SOFT_SLATE.fontFamily,
              color: SOFT_SLATE.textPrimary,
              minWidth: 0,
            }}
          >
            {!isDesktop && <DashboardIconRail go={go} isDesktop={false} />}

            {/* Greeting */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 20,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: isDesktop ? 30 : 24,
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                      color: SOFT_SLATE.textPrimary,
                    }}
                  >
                    Hello, User!
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: SOFT_SLATE.textSecondary,
                      marginTop: 4,
                    }}
                  >
                    See It. Know It. Eat It.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <Tooltip label="Open profile">
                    <button
                      type="button"
                      onClick={() => go("profile")}
                      aria-label="Open profile"
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: SOFT_SLATE.bg,
                        border: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: SOFT_SLATE.raisedSm,
                        cursor: "pointer",
                      }}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={SOFT_SLATE.green}
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <circle cx="12" cy="8" r="4" />
                        <path d="M6 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
                      </svg>
                    </button>
                  </Tooltip>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 22,
                  alignItems: "flex-start",
                  flexDirection: isDesktop ? "row" : "column",
                }}
              >
                {/* ── Left column — scan actions ─────────────────────────── */}
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 18,
                  }}
                >
                  {/* Scan Barcode */}
                  <div
                    style={{
                      background: SOFT_SLATE.bg,
                      borderRadius: 26,
                      padding: isDesktop ? 28 : 20,
                      boxShadow: SOFT_SLATE.raisedLg,
                      boxSizing: "border-box",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 12,
                          background: SOFT_SLATE.gold,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: SOFT_SLATE.raisedIconWell,
                          flexShrink: 0,
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#3f2f06"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="M3 5V3h2" />
                          <path d="M19 3h2v2" />
                          <path d="M21 19v2h-2" />
                          <path d="M5 21H3v-2" />
                          <path d="M7 8v8" />
                          <path d="M11 8v8" />
                          <path d="M15 8v8" />
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
                          Scan Barcode
                        </div>
                        <div style={{ fontSize: 13, color: SOFT_SLATE.textSecondary }}>
                          Get product information from the food.
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => go("barcode")}
                      style={{
                        width: "100%",
                        marginTop: 22,
                        border: "none",
                        borderRadius: 20,
                        background: SOFT_SLATE.bg,
                        padding: isDesktop ? "26px 20px" : "20px 16px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 12,
                        boxShadow: SOFT_SLATE.insetLg,
                        cursor: "pointer",
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-end",
                          gap: 3,
                          height: isDesktop ? 74 : 58,
                        }}
                      >
                        {BARCODE_BARS.map((w, i) => (
                          <div
                            key={i}
                            style={{
                              width: w,
                              height: "100%",
                              background: SOFT_SLATE.barDark,
                              flexShrink: 0,
                            }}
                          />
                        ))}
                      </div>
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          letterSpacing: "0.24em",
                          color: "#555c63",
                        }}
                      >
                        1234567890000
                      </span>
                    </button>

                    <div style={{ marginTop: 20, display: "flex", gap: 14 }}>
                      <button
                        type="button"
                        onClick={() => go("barcode")}
                        style={{
                          padding: "15px 26px",
                          border: "none",
                          borderRadius: 16,
                          background: SOFT_SLATE.green,
                          color: "#ffffff",
                          fontSize: 14,
                          fontWeight: 700,
                          boxShadow: SOFT_SLATE.raisedBtn,
                          cursor: "pointer",
                        }}
                      >
                        Start scan
                      </button>
                      <button
                        type="button"
                        onClick={() => go("barcode")}
                        style={{
                          padding: "15px 26px",
                          border: "none",
                          borderRadius: 16,
                          background: SOFT_SLATE.bg,
                          color: "#4a5158",
                          fontSize: 14,
                          fontWeight: 700,
                          boxShadow: SOFT_SLATE.raisedBtnAlt,
                          cursor: "pointer",
                        }}
                      >
                        Enter code manually
                      </button>
                    </div>
                  </div>

                  {/* OCR + Compare */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 18,
                    }}
                  >
                    {actionCards.map((card) => (
                      <button
                        type="button"
                        key={card.label}
                        onClick={card.action}
                        style={{
                          background: SOFT_SLATE.bg,
                          border: "none",
                          borderRadius: 22,
                          padding: 24,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          gap: 14,
                          boxShadow: SOFT_SLATE.raisedMd,
                          cursor: "pointer",
                          boxSizing: "border-box",
                          textAlign: "left",
                        }}
                      >
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 16,
                            background: SOFT_SLATE.bg,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: SOFT_SLATE.insetMd,
                          }}
                        >
                          <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={SOFT_SLATE.green}
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            {card.path}
                          </svg>
                        </div>
                        <div>
                          <div style={{ fontSize: 17, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
                            {card.label}
                          </div>
                          <div style={{ fontSize: 13, color: SOFT_SLATE.textSecondary, marginTop: 3 }}>
                            {card.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Right column — scan history ────────────────────────── */}
                <div
                  style={{
                    width: isDesktop ? 384 : "100%",
                    flex: "none",
                    background: SOFT_SLATE.bg,
                    borderRadius: 26,
                    padding: "24px 22px",
                    boxShadow: SOFT_SLATE.raisedLg,
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
                      Scan History
                    </div>
                    <button
                      type="button"
                      onClick={() => go("history")}
                      style={{
                        border: "none",
                        background: "none",
                        padding: 0,
                        fontSize: 12,
                        fontWeight: 700,
                        color: SOFT_SLATE.green,
                        cursor: "pointer",
                      }}
                    >
                      View All
                    </button>
                  </div>

                  <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                    {RECENT_SCANS.map((scan) => {
                      const status = scanStatusInfo(scan.score)
                      const statusColor =
                        status.label === "Safe"
                          ? SOFT_SLATE.green
                          : status.label === "Caution"
                            ? SOFT_SLATE.caution
                            : SOFT_SLATE.unsafe
                      return (
                        <button
                          type="button"
                          key={`${scan.name}-${scan.time}`}
                          onClick={() => go("productResult")}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: 14,
                            padding: "13px 15px",
                            border: "none",
                            borderRadius: 18,
                            background: SOFT_SLATE.bg,
                            boxShadow: SOFT_SLATE.raisedSm,
                            cursor: "pointer",
                            textAlign: "left",
                            boxSizing: "border-box",
                          }}
                        >
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              flexShrink: 0,
                              borderRadius: 12,
                              background: SOFT_SLATE.thumbBg,
                              boxShadow: SOFT_SLATE.insetSm,
                              overflow: "hidden",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {scan.imageUrl && (
                              <img
                                src={scan.imageUrl}
                                alt=""
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: SOFT_SLATE.textPrimary }}>
                              {scan.name}
                            </div>
                            <div style={{ fontSize: 11, color: SOFT_SLATE.textMuted }}>
                              {scan.date} · {scan.time} · {scan.method}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: statusColor }}>
                              {scan.score}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                                color: statusColor,
                              }}
                            >
                              {status.label.toUpperCase()}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
        </Center>
      </div>
    </div>
  )
}
// ── Barcode Scanner Screen — Soft Slate ─────────────────────────────────────
// Reskinned to match DashboardScreen's neumorphic "Soft Slate" direction:
// same SOFT_SLATE token set, same DashboardIconRail nav shell, raised/inset
// shadows instead of flat borders, and the same green/gold/caution/unsafe
// status vocabulary the Dashboard's scan history already uses. All scanning
// logic (camera, ZXing, backend lookup, validation) is untouched — only the
// render layer changed.
//
// Assumes this file lives alongside dashboard.tsx and can import: SOFT_SLATE,
// DashboardIconRail, DASHBOARD_RAIL_ITEMS, Screen, Tooltip, Center, SAFE_TOP,
// useIsDesktop, BrowserMultiFormatReader. Adjust the import paths below to
// match your project structure.

type ScannerStatus =
  | "ready"
  | "camera-loading"
  | "scanning"
  | "captured"
  | "processing"
  | "success"
  | "invalid"
  | "not-found"
  | "permission-denied"
  | "unsupported"
  | "network-error"
  | "error"

type ProductResult = {
  barcode?: string
  productInformation?: {
    name?: string
    brand?: string
    category?: string
    image?: string
    imageUrl?: string
  }
  product?: {
    name?: string
    brand?: string
    category?: string
    image?: string
    image_url?: string
    ingredients?: string
    ingredients_text?: string
    nutrition?: Record<string, any>
  }
  ingredients?: string | string[]
  nutrition?: Record<string, any>
  healthAnalysis?: { score?: number; rating?: string; summary?: string }
  allergyCheck?: { hasAllergy?: boolean; matchedAllergies?: string[] }
  allergyStatus?: string
  [key: string]: any
}

// Barcode icon path reused from Dashboard's "Scan Barcode" card icon, so the
// rail entry for this screen matches the same glyph the dashboard uses to
// link here.
const BARCODE_ICON_PATH: ReactNode = (
  <>
    <path d="M3 5V3h2" />
    <path d="M19 3h2v2" />
    <path d="M21 19v2h-2" />
    <path d="M5 21H3v-2" />
    <path d="M7 8v8" />
    <path d="M11 8v8" />
    <path d="M15 8v8" />
  </>
)

// Barcode Scanner's own rail set: Dashboard, this screen, then the usual
// Settings/Help/About — same pattern SCAN_HISTORY_RAIL_ITEMS uses on the
// Scan History screen.
const BARCODE_RAIL_ITEMS: { screen: Screen; label: string; path: ReactNode }[] = [
  DASHBOARD_RAIL_ITEMS[0],
  { screen: "barcode", label: "Barcode Scanner", path: BARCODE_ICON_PATH },
  DASHBOARD_RAIL_ITEMS[1],
  DASHBOARD_RAIL_ITEMS[2],
  DASHBOARD_RAIL_ITEMS[3],
]

// Soft-tinted status backgrounds — the exact pairs scanStatusInfo() uses on
// the Dashboard, so a "Safe/Caution/Avoid" reads the same everywhere.
const STATUS_TINTS = {
  green: { fg: SOFT_SLATE.green, bg: "#E1EBE5" },
  caution: { fg: SOFT_SLATE.caution, bg: "#F1E3D8" },
  unsafe: { fg: SOFT_SLATE.unsafe, bg: "#F1DEDA" },
}

function BarcodeScannerScreen({ go }: { go: (s: Screen) => void }) {
  // ── UI STATE ──────────────────────────────────────────────────────────────
  const [showHelp, setShowHelp] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showLogoutLoading, setShowLogoutLoading] = useState(false)
  const [scanStatus, setScanStatus] = useState<ScannerStatus>("ready")
  const [barcodeValue, setBarcodeValue] = useState("")
  const [manualBarcode, setManualBarcode] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment")
  const [flashOn, setFlashOn] = useState(false)
  const [galleryImage, setGalleryImage] = useState<string | null>(null)
  const [productResult, setProductResult] = useState<ProductResult | null>(null)

  // ── REFS ──────────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const processingRef = useRef(false)
  const lastScannedBarcodeRef = useRef<string>("")
  const lastScanTimeRef = useRef<number>(0)
  const isMountedRef = useRef(true)
  const galleryObjectUrlRef = useRef<string | null>(null)

  const isDesktop = useIsDesktop()

  // ── BACKEND API ───────────────────────────────────────────────────────────
  const BACKEND_API_URL =
    import.meta.env.VITE_BARCODE_LOOKUP_URL || "/api/barcode/lookup"

  // ── STOP CAMERA ───────────────────────────────────────────────────────────
  const stopCamera = () => {
    try {
      if (readerRef.current) {
        try {
          readerRef.current.reset()
        } catch (error) {
          console.warn("ZXing reader reset failed:", error)
        }
        readerRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.srcObject = null
      }
    } catch (error) {
      console.warn("Unable to completely stop camera:", error)
    }
    setFlashOn(false)
  }

  // ── VALIDATE BARCODE ──────────────────────────────────────────────────────
  const validateBarcode = (barcode: string) => {
    const value = barcode.trim()
    if (!value) return { valid: false, message: "Please enter a barcode number." }
    if (!/^\d+$/.test(value)) return { valid: false, message: "Barcode must contain numbers only." }
    if (![8, 12, 13, 14].includes(value.length)) {
      return { valid: false, message: "Please enter a valid 8, 12, 13, or 14-digit product barcode." }
    }
    return { valid: true, message: "" }
  }

  // ── DUPLICATE SCAN PROTECTION ─────────────────────────────────────────────
  const isDuplicateScan = (barcode: string) => {
    const now = Date.now()
    const sameBarcode = lastScannedBarcodeRef.current === barcode
    const scannedRecently = now - lastScanTimeRef.current < 5000
    return sameBarcode && scannedRecently
  }

  // ── NORMALIZE BACKEND RESULT ──────────────────────────────────────────────
  const normalizeProductResult = (result: any, barcode: string): ProductResult => {
    return {
      ...result,
      barcode: result?.barcode || barcode,
      productInformation:
        result?.productInformation || result?.product_information || result?.product || {},
      product: result?.product || result?.productInformation || {},
      ingredients:
        result?.ingredients ||
        result?.product?.ingredients ||
        result?.product?.ingredients_text ||
        result?.productInformation?.ingredients ||
        "",
      nutrition: result?.nutrition || result?.nutriments || result?.product?.nutrition || {},
    }
  }

  // ── LOOKUP BARCODE THROUGH BACKEND ────────────────────────────────────────
  const lookupBarcode = async (barcode: string) => {
    const cleanBarcode = barcode.trim()
    try {
      const response = await fetch(BACKEND_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ barcode: cleanBarcode }),
      })

      let data: any = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (
        response.status === 404 ||
        data?.found === false ||
        data?.productFound === false ||
        data?.product_found === false ||
        data?.status === "not_found"
      ) {
        throw new Error("__PRODUCT_NOT_FOUND__")
      }

      if (response.status === 400 || response.status === 422) {
        throw new Error(data?.message || data?.error || "The barcode sent to the server is invalid.")
      }

      if (!response.ok) {
        throw new Error(data?.message || data?.error || "The server could not retrieve the product information.")
      }

      if (!data) throw new Error("The server returned an empty response.")

      if (data?.product === null || data?.productInformation === null || data?.data === null) {
        throw new Error("__PRODUCT_NOT_FOUND__")
      }

      return data
    } catch (error) {
      if (error instanceof Error && error.message === "__PRODUCT_NOT_FOUND__") throw error
      if (error instanceof TypeError) throw new Error("__NETWORK_ERROR__")
      throw error
    }
  }

  // ── PROCESS BARCODE (camera + manual share this) ─────────────────────────
  const processBarcode = async (barcode: string) => {
    const cleanBarcode = barcode.trim()
    const validation = validateBarcode(cleanBarcode)
    if (!validation.valid) {
      setErrorMessage(validation.message)
      setScanStatus("invalid")
      return
    }
    if (isDuplicateScan(cleanBarcode)) return
    if (processingRef.current) return

    processingRef.current = true
    lastScannedBarcodeRef.current = cleanBarcode
    lastScanTimeRef.current = Date.now()

    try {
      setErrorMessage("")
      setBarcodeValue(cleanBarcode)
      setManualBarcode(cleanBarcode)

      setScanStatus("captured")
      stopCamera()
      await new Promise((resolve) => setTimeout(resolve, 1500))
      if (!isMountedRef.current) return

      setScanStatus("processing")
      const result = await lookupBarcode(cleanBarcode)
      if (!isMountedRef.current) return

      const normalized = normalizeProductResult(result, cleanBarcode)
      setProductResult(normalized)

      try {
        localStorage.setItem("scanityProductResult", JSON.stringify(normalized))
        localStorage.setItem("scanityLastBarcode", cleanBarcode)
      } catch (storageError) {
        console.warn("Unable to save scan result:", storageError)
      }

      setScanStatus("success")
      await new Promise((resolve) => setTimeout(resolve, 1500))
      if (isMountedRef.current) go("productResult")
    } catch (error) {
      console.error("Barcode processing error:", error)
      if (!isMountedRef.current) return
      stopCamera()

      if (error instanceof Error && error.message === "__PRODUCT_NOT_FOUND__") {
        setErrorMessage("We couldn't find a product for this barcode.")
        setScanStatus("not-found")
        return
      }

      if (error instanceof Error && error.message === "__NETWORK_ERROR__") {
        setErrorMessage("Unable to connect to the server. Please check your internet connection and try again.")
        setScanStatus("network-error")
        return
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong while looking up the product."
      )
      setScanStatus("error")
    } finally {
      processingRef.current = false
    }
  }

  // ── START CAMERA ──────────────────────────────────────────────────────────
  const startCamera = async (requestedFacing?: "environment" | "user") => {
    if (processingRef.current) return
    try {
      setErrorMessage("")
      setBarcodeValue("")
      setGalleryImage(null)
      setFlashOn(false)
      lastScannedBarcodeRef.current = ""
      lastScanTimeRef.current = 0

      setScanStatus("camera-loading")
      stopCamera()

      if (!window.isSecureContext) throw new Error("__UNSUPPORTED_CAMERA__")
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("__UNSUPPORTED_CAMERA__")
      }
      if (!videoRef.current) throw new Error("Camera preview could not be initialized.")

      const facing = requestedFacing || cameraFacing
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader

      await reader.decodeFromConstraints(
        {
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        },
        videoRef.current,
        async (result, error, controls) => {
          if (result) {
            const value = result.getText().trim()
            if (!value) return
            try {
              controls.stop()
            } catch {
              // ignore
            }
            await processBarcode(value)
            return
          }
          if (error) return
        }
      )

      if (!isMountedRef.current) return

      const video = videoRef.current
      if (video && video.srcObject instanceof MediaStream) {
        streamRef.current = video.srcObject
      }
      if (!streamRef.current && video?.srcObject) {
        streamRef.current = video.srcObject as MediaStream
      }

      if (!processingRef.current) setScanStatus("scanning")
    } catch (error) {
      console.error("Camera start error:", error)
      stopCamera()
      if (!isMountedRef.current) return

      if (
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")
      ) {
        setErrorMessage("Camera permission was denied. Please allow camera access in your browser settings and try again.")
        setScanStatus("permission-denied")
        return
      }

      if (error instanceof DOMException && error.name === "NotReadableError") {
        setErrorMessage("The camera is already being used by another application or browser tab.")
        setScanStatus("error")
        return
      }

      if (error instanceof DOMException && error.name === "NotFoundError") {
        setErrorMessage("No camera was found on this device.")
        setScanStatus("error")
        return
      }

      if (error instanceof Error && error.message === "__UNSUPPORTED_CAMERA__") {
        setErrorMessage(
          "Camera access is not supported here. Open Scanity using localhost or HTTPS and use a modern browser such as Chrome, Edge, or Safari."
        )
        setScanStatus("unsupported")
        return
      }

      setErrorMessage(error instanceof Error ? error.message : "Camera access could not be started.")
      setScanStatus("error")
    }
  }

  // ── ROTATE CAMERA ─────────────────────────────────────────────────────────
  const rotateCamera = async () => {
    const nextFacing = cameraFacing === "environment" ? "user" : "environment"
    setCameraFacing(nextFacing)
    if (scanStatus === "scanning" || scanStatus === "camera-loading") {
      await startCamera(nextFacing)
    }
  }

  // ── FLASH ─────────────────────────────────────────────────────────────────
  const toggleFlash = async () => {
    const stream = streamRef.current
    if (!stream) {
      setErrorMessage("Start the camera first before using the flash.")
      setScanStatus("error")
      return
    }
    const track = stream.getVideoTracks()[0]
    if (!track) {
      setErrorMessage("No active camera track was found.")
      return
    }
    try {
      const capabilities = typeof track.getCapabilities === "function" ? track.getCapabilities() : null
      if (!(capabilities as any)?.torch) {
        setErrorMessage("Flash is not supported by this camera.")
        return
      }
      const nextFlash = !flashOn
      await track.applyConstraints({ advanced: [{ torch: nextFlash } as any] })
      setFlashOn(nextFlash)
      setErrorMessage("")
    } catch (error) {
      console.error("Flash error:", error)
      setErrorMessage("The flash could not be controlled on this device.")
    }
  }

  // ── MANUAL BARCODE ────────────────────────────────────────────────────────
  const handleManualScan = () => {
    const value = manualBarcode.trim()
    const validation = validateBarcode(value)
    if (!validation.valid) {
      setErrorMessage(validation.message)
      setScanStatus("invalid")
      return
    }
    processBarcode(value)
  }

  // ── GALLERY ───────────────────────────────────────────────────────────────
  const handleGallery = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please select a valid image.")
      setScanStatus("invalid")
      return
    }
    if (galleryObjectUrlRef.current) URL.revokeObjectURL(galleryObjectUrlRef.current)
    const imageUrl = URL.createObjectURL(file)
    galleryObjectUrlRef.current = imageUrl
    setGalleryImage(imageUrl)
    setErrorMessage("")
    setScanStatus("ready")
    event.target.value = ""
  }

  // ── RETRY / RESCAN ────────────────────────────────────────────────────────
  const handleRetry = () => {
    stopCamera()
    processingRef.current = false
    lastScannedBarcodeRef.current = ""
    lastScanTimeRef.current = 0
    setErrorMessage("")
    setBarcodeValue("")
    setManualBarcode("")
    setGalleryImage(null)
    setProductResult(null)
    setScanStatus("ready")
  }

  const handleRescan = () => {
    stopCamera()
    processingRef.current = false
    lastScannedBarcodeRef.current = ""
    lastScanTimeRef.current = 0
    setErrorMessage("")
    setBarcodeValue("")
    setGalleryImage(null)
    setProductResult(null)
    setScanStatus("ready")
  }

  // ── LOGOUT ────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    setShowLogoutConfirm(false)
    setShowLogoutLoading(true)
    stopCamera()
    setTimeout(() => {
      setShowLogoutLoading(false)
      go("splash")
    }, 1800)
  }

  // ── CLEANUP ───────────────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      stopCamera()
      if (galleryObjectUrlRef.current) {
        URL.revokeObjectURL(galleryObjectUrlRef.current)
        galleryObjectUrlRef.current = null
      }
    }
  }, [])

  // ── STATUS COPY ───────────────────────────────────────────────────────────
  const getStatusTitle = () => {
    switch (scanStatus) {
      case "ready": return "Ready to scan"
      case "camera-loading": return "Starting camera..."
      case "scanning": return "Scanning barcode..."
      case "captured": return "Barcode captured"
      case "processing": return "Analyzing product..."
      case "success": return "Product found!"
      case "invalid": return "Invalid barcode"
      case "not-found": return "Product not found"
      case "permission-denied": return "Camera permission denied"
      case "unsupported": return "Camera unavailable"
      case "network-error": return "Connection problem"
      case "error": return "Unable to scan"
      default: return "Ready to scan"
    }
  }

  const getStatusDescription = () => {
    switch (scanStatus) {
      case "ready": return "Scan a food product barcode to get nutrition and allergy information."
      case "camera-loading": return "Please wait while Scanity starts your camera."
      case "scanning": return "Position the barcode inside the frame and keep it steady."
      case "captured": return barcodeValue ? `Barcode: ${barcodeValue}` : "Barcode successfully detected."
      case "processing": return "Getting product information from the Scanity backend."
      case "success":
        return productResult?.productInformation?.name
          ? `${productResult.productInformation.name} was found.`
          : "Product information was successfully retrieved."
      case "invalid": return errorMessage || "Please enter a valid product barcode."
      case "not-found": return errorMessage || "No product information was found for this barcode."
      case "permission-denied": return errorMessage || "Allow camera access in your browser settings and try again."
      case "unsupported": return errorMessage || "Your current browser or connection does not support camera access."
      case "network-error": return errorMessage || "Check your internet connection and try again."
      case "error": return errorMessage || "Something went wrong while scanning."
      default: return ""
    }
  }

  const getStatusIcon = () => {
    switch (scanStatus) {
      case "success":
      case "captured":
        return "fa-check"
      case "invalid": return "fa-exclamation"
      case "not-found": return "fa-search"
      case "permission-denied": return "fa-lock"
      case "unsupported": return "fa-video-camera"
      case "network-error": return "fa-wifi"
      case "error": return "fa-exclamation-triangle"
      default: return "fa-camera"
    }
  }

  // "not-found" reads as informational (gold), everything else that's a
  // problem reads as unsafe (red) — same two-tier vocabulary the Dashboard
  // uses for Caution vs Avoid.
  const errorTint = scanStatus === "not-found" ? STATUS_TINTS.caution : STATUS_TINTS.unsafe

  const isBusy =
    scanStatus === "processing" || scanStatus === "captured" || scanStatus === "success"

  // ── MAIN ──────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background: SOFT_SLATE.bg,
        fontFamily: SOFT_SLATE.fontFamily,
      }}
    >
      <style>
        {`
          @keyframes scanityScanLine {
            0% { top: 10%; opacity: 0.4; }
            50% { top: 85%; opacity: 1; }
            100% { top: 10%; opacity: 0.4; }
          }
          @keyframes scanitySpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes scanitySuccessPop {
            0% { transform: scale(0.7); opacity: 0; }
            70% { transform: scale(1.08); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
          .scanity-scanner-button {
            transition: transform 0.15s ease, box-shadow 0.15s ease;
          }
          .scanity-scanner-button:hover:not(:disabled) {
            transform: translateY(-2px);
          }
          .scanity-scanner-button:active:not(:disabled) {
            transform: scale(0.97);
          }
          .scanity-manual-input:focus {
            outline: none;
            box-shadow: ${SOFT_SLATE.insetMd};
          }
        `}
      </style>

      {/* ── Icon rail — same shell as Dashboard/Scan History ───────────────── */}
      {isDesktop && (
        <div style={{ position: "fixed", top: 22, left: 26, bottom: 22, width: 80, zIndex: 5 }}>
           <DashboardIconRail go={go} isDesktop />
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          paddingTop: SAFE_TOP,
          boxSizing: "border-box",
          marginLeft: isDesktop ? 80 + 26 + 26 : 0,
        }}
      >
        <Center maxWidth={isDesktop ? 1420 - (80 + 26 + 26) : undefined}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 22,
              padding: isDesktop ? "26px 40px 40px 0" : "16px 14px 30px",
              boxSizing: "border-box",
              color: SOFT_SLATE.textPrimary,
              minWidth: 0,
            }}
          >
            {!isDesktop && (
              <DashboardIconRail go={go} isDesktop={false} active="barcode" navItems={BARCODE_RAIL_ITEMS} />
            )}

            {/* ── Header ───────────────────────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
              <div>
                <div
                  style={{
                    fontSize: isDesktop ? 30 : 24,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    color: SOFT_SLATE.textPrimary,
                  }}
                >
                  Barcode Scanner
                </div>
                <div style={{ fontSize: 14, color: SOFT_SLATE.textSecondary, marginTop: 4 }}>
                  Scan a food product barcode
                </div>
              </div>

              <Tooltip label="How to scan">
                <button
                  type="button"
                  className="scanity-scanner-button"
                  onClick={() => setShowHelp(true)}
                  aria-label="How to scan"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: SOFT_SLATE.bg,
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: SOFT_SLATE.raisedSm,
                    cursor: "pointer",
                    color: SOFT_SLATE.green,
                    fontSize: 15,
                  }}
                >
                  <i className="fa fa-question" />
                </button>
              </Tooltip>
            </div>

            {/* ── Scanner card ─────────────────────────────────────────── */}
            <div
              style={{
                background: SOFT_SLATE.bg,
                borderRadius: 26,
                padding: isDesktop ? 28 : 18,
                boxShadow: SOFT_SLATE.raisedLg,
                boxSizing: "border-box",
              }}
            >
              {/* Camera well */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  maxWidth: isDesktop ? 900 : 640,
                  height: isDesktop ? 480 : 280,
                  margin: "0 auto",
                  background: "#111111",
                  borderRadius: 20,
                  overflow: "hidden",
                  boxShadow: SOFT_SLATE.insetLg,
                }}
              >
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: cameraFacing === "user" ? "scaleX(-1)" : "none",
                    display: isBusy ? "none" : "block",
                  }}
                />

                {galleryImage && (
                  <img
                    src={galleryImage}
                    alt="Selected barcode"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#111111" }}
                  />
                )}

                {/* READY */}
                {scanStatus === "ready" && !galleryImage && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      padding: 20,
                      color: "#FFFFFF",
                    }}
                  >
                    <div
                      style={{
                        width: 66,
                        height: 66,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.12)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 14,
                      }}
                    >
                      <i className="fa fa-camera" style={{ fontSize: 27 }} />
                    </div>
                    <strong style={{ fontSize: 16 }}>Camera ready</strong>
                    <span style={{ marginTop: 7, fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
                      Tap Camera to begin
                    </span>
                  </div>
                )}

                {/* CAMERA LOADING */}
                {scanStatus === "camera-loading" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0,0,0,0.88)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      color: "#FFFFFF",
                    }}
                  >
                    <div
                      style={{
                        width: 45,
                        height: 45,
                        borderRadius: "50%",
                        border: "4px solid rgba(255,255,255,0.25)",
                        borderTopColor: SOFT_SLATE.green,
                        animation: "scanitySpin 0.8s linear infinite",
                        marginBottom: 15,
                      }}
                    />
                    <strong style={{ fontSize: 16 }}>Starting camera...</strong>
                    <span style={{ marginTop: 7, fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
                      Please allow camera access if requested.
                    </span>
                  </div>
                )}

                {/* SCANNING FRAME */}
                {scanStatus === "scanning" && (
                  <>
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        width: isDesktop ? "68%" : "76%",
                        height: isDesktop ? "45%" : "42%",
                        transform: "translate(-50%, -50%)",
                        border: "2px solid rgba(255,255,255,0.9)",
                        borderRadius: 18,
                        boxShadow: "0 0 0 9999px rgba(0,0,0,0.32)",
                      }}
                    >
                      <span style={{ position: "absolute", left: -2, top: -2, width: 32, height: 32, borderTop: `4px solid ${SOFT_SLATE.gold}`, borderLeft: `4px solid ${SOFT_SLATE.gold}`, borderRadius: "10px 0 0 0" }} />
                      <span style={{ position: "absolute", right: -2, top: -2, width: 32, height: 32, borderTop: `4px solid ${SOFT_SLATE.gold}`, borderRight: `4px solid ${SOFT_SLATE.gold}`, borderRadius: "0 10px 0 0" }} />
                      <span style={{ position: "absolute", left: -2, bottom: -2, width: 32, height: 32, borderBottom: `4px solid ${SOFT_SLATE.gold}`, borderLeft: `4px solid ${SOFT_SLATE.gold}`, borderRadius: "0 0 0 10px" }} />
                      <span style={{ position: "absolute", right: -2, bottom: -2, width: 32, height: 32, borderBottom: `4px solid ${SOFT_SLATE.gold}`, borderRight: `4px solid ${SOFT_SLATE.gold}`, borderRadius: "0 0 10px 0" }} />
                      <span
                        style={{
                          position: "absolute",
                          left: "4%",
                          right: "4%",
                          height: 2,
                          background: SOFT_SLATE.gold,
                          boxShadow: "0 0 10px rgba(216,160,42,0.9)",
                          animation: "scanityScanLine 2s ease-in-out infinite",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        bottom: 18,
                        left: 0,
                        right: 0,
                        textAlign: "center",
                        color: "#FFFFFF",
                        fontSize: 10,
                        fontWeight: 600,
                        textShadow: "0 1px 5px rgba(0,0,0,0.8)",
                      }}
                    >
                      Position the barcode inside the frame
                    </div>
                  </>
                )}

                {/* CAPTURED */}
                {scanStatus === "captured" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: `${SOFT_SLATE.green}f5`,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#FFFFFF",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 70,
                        height: 70,
                        borderRadius: "50%",
                        background: "#FFFFFF",
                        color: SOFT_SLATE.green,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 14,
                        animation: "scanitySuccessPop 0.35s ease both",
                      }}
                    >
                      <i className="fa fa-check" style={{ fontSize: 34 }} />
                    </div>
                    <strong style={{ fontSize: 18 }}>Barcode Captured</strong>
                    <span style={{ marginTop: 7, fontSize: 12, opacity: 0.9 }}>{barcodeValue}</span>
                  </div>
                )}

                {/* PROCESSING */}
                {scanStatus === "processing" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(233,237,242,0.97)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 45,
                        height: 45,
                        borderRadius: "50%",
                        border: "4px solid #c6ccd4",
                        borderTopColor: SOFT_SLATE.green,
                        animation: "scanitySpin 0.8s linear infinite",
                        marginBottom: 15,
                      }}
                    />
                    <strong style={{ fontSize: 16, color: SOFT_SLATE.textPrimary }}>Analyzing product...</strong>
                    <span style={{ maxWidth: 390, marginTop: 7, padding: "0 20px", fontSize: 10, lineHeight: 1.6, color: SOFT_SLATE.textMuted }}>
                      Getting real product information from the Scanity backend.
                    </span>
                  </div>
                )}

                {/* SUCCESS */}
                {scanStatus === "success" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: `${SOFT_SLATE.green}f5`,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#FFFFFF",
                      textAlign: "center",
                      padding: 20,
                    }}
                  >
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: "50%",
                        background: "#FFFFFF",
                        color: SOFT_SLATE.green,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 14,
                        animation: "scanitySuccessPop 0.35s ease both",
                      }}
                    >
                      <i className="fa fa-check" style={{ fontSize: 36 }} />
                    </div>
                    <strong style={{ fontSize: 18 }}>Product Found!</strong>
                    <span style={{ marginTop: 8, fontSize: 11, opacity: 0.9 }}>Opening product information...</span>
                  </div>
                )}

                {/* ERROR STATES */}
                {["invalid", "not-found", "permission-denied", "unsupported", "network-error", "error"].includes(scanStatus) && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(233,237,242,0.97)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      padding: 25,
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: "50%",
                        background: errorTint.bg,
                        color: errorTint.fg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 13,
                      }}
                    >
                      <i className={`fa ${getStatusIcon()}`} style={{ fontSize: 24 }} />
                    </div>
                    <strong style={{ fontSize: 16, color: SOFT_SLATE.textPrimary }}>{getStatusTitle()}</strong>
                    <span style={{ maxWidth: 440, marginTop: 8, fontSize: 10, lineHeight: 1.6, color: SOFT_SLATE.textMuted }}>
                      {getStatusDescription()}
                    </span>
                    <button
                      type="button"
                      className="scanity-scanner-button"
                      onClick={handleRetry}
                      style={{
                        marginTop: 17,
                        padding: "11px 22px",
                        border: "none",
                        borderRadius: 14,
                        background: SOFT_SLATE.green,
                        color: "#ffffff",
                        fontWeight: 700,
                        fontSize: 11,
                        cursor: "pointer",
                        boxShadow: SOFT_SLATE.raisedBtn,
                      }}
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>

              {/* ── Status copy ───────────────────────────────────────── */}
              <div style={{ textAlign: "center", marginTop: 20 }}>
                <h2 style={{ margin: 0, fontWeight: 800, fontSize: isDesktop ? 19 : 17, color: SOFT_SLATE.textPrimary }}>
                  {getStatusTitle()}
                </h2>
                <p style={{ maxWidth: 530, margin: "7px auto 0", fontSize: 10, lineHeight: 1.6, color: SOFT_SLATE.textMuted }}>
                  {getStatusDescription()}
                </p>
              </div>

              {/* ── Controls ──────────────────────────────────────────── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, maxWidth: 560, margin: "22px auto 0" }}>
                {[
                  { key: "camera", label: "Camera", icon: "fa-camera", onClick: () => startCamera(), disabled: isBusy, active: false },
                  { key: "rotate", label: "Rotate Camera", icon: "fa-refresh", onClick: rotateCamera, disabled: false, active: false },
                  { key: "flash", label: "Flash", icon: "fa-bolt", onClick: toggleFlash, disabled: false, active: flashOn },
                ].map((control) => (
                  <button
                    key={control.key}
                    type="button"
                    className="scanity-scanner-button"
                    onClick={control.onClick}
                    disabled={control.disabled}
                    style={{
                      border: "none",
                      background: SOFT_SLATE.bg,
                      borderRadius: 16,
                      padding: isDesktop ? "16px 8px" : "13px 5px",
                      color: control.active ? SOFT_SLATE.gold : SOFT_SLATE.green,
                      cursor: control.disabled ? "default" : "pointer",
                      opacity: control.disabled ? 0.5 : 1,
                      boxShadow: control.active ? SOFT_SLATE.insetMd : SOFT_SLATE.raisedSm,
                    }}
                  >
                    <i className={`fa ${control.icon}`} style={{ fontSize: 17 }} />
                    <div style={{ marginTop: 6, fontWeight: 600, fontSize: 9 }}>{control.label}</div>
                  </button>
                ))}

                <label
                  className="scanity-scanner-button"
                  style={{
                    border: "none",
                    background: SOFT_SLATE.bg,
                    borderRadius: 16,
                    padding: isDesktop ? "16px 8px" : "13px 5px",
                    color: SOFT_SLATE.green,
                    cursor: "pointer",
                    textAlign: "center",
                    boxShadow: SOFT_SLATE.raisedSm,
                  }}
                >
                  <i className="fa fa-picture-o" style={{ fontSize: 17 }} />
                  <div style={{ marginTop: 6, fontWeight: 600, fontSize: 9 }}>Gallery</div>
                  <input type="file" accept="image/*" onChange={handleGallery} style={{ display: "none" }} />
                </label>
              </div>

              {/* ── Start camera ──────────────────────────────────────── */}
              {!["scanning", "captured", "processing", "camera-loading", "success"].includes(scanStatus) && (
                <button
                  type="button"
                  className="scanity-scanner-button"
                  onClick={() => startCamera()}
                  style={{
                    display: "block",
                    width: "100%",
                    maxWidth: 560,
                    margin: "20px auto 0",
                    padding: 16,
                    border: "none",
                    borderRadius: 16,
                    background: SOFT_SLATE.green,
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    boxShadow: SOFT_SLATE.raisedBtn,
                  }}
                >
                  <i className="fa fa-camera" style={{ marginRight: 8 }} />
                  Start Camera
                </button>
              )}

              {/* ── Rescan ────────────────────────────────────────────── */}
              {(scanStatus === "success" || scanStatus === "not-found") && (
                <button
                  type="button"
                  className="scanity-scanner-button"
                  onClick={handleRescan}
                  style={{
                    display: "block",
                    width: "100%",
                    maxWidth: 560,
                    margin: "20px auto 0",
                    padding: 15,
                    border: "none",
                    borderRadius: 16,
                    background: SOFT_SLATE.bg,
                    color: SOFT_SLATE.green,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    boxShadow: SOFT_SLATE.raisedBtnAlt,
                  }}
                >
                  <i className="fa fa-refresh" style={{ marginRight: 7 }} />
                  Scan Another Product
                </button>
              )}

              {/* ── Manual barcode entry ──────────────────────────────── */}
              <div style={{ maxWidth: 560, margin: "26px auto 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <i className="fa fa-keyboard-o" style={{ color: SOFT_SLATE.green, fontSize: 14 }} />
                  <span style={{ fontWeight: 700, fontSize: 11, color: SOFT_SLATE.textPrimary }}>
                    Enter barcode manually
                  </span>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    className="scanity-manual-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={14}
                    value={manualBarcode}
                    onChange={(event) => {
                      const numeric = event.target.value.replace(/\D/g, "")
                      setManualBarcode(numeric)
                      if (["invalid", "error", "network-error"].includes(scanStatus)) {
                        setErrorMessage("")
                        setScanStatus("ready")
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleManualScan()
                    }}
                    placeholder="e.g. 4800012345678"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: 48,
                      boxSizing: "border-box",
                      border: "none",
                      borderRadius: 14,
                      background: SOFT_SLATE.bg,
                      boxShadow: SOFT_SLATE.insetSm,
                      padding: "0 14px",
                      fontFamily: SOFT_SLATE.fontFamily,
                      fontSize: 11,
                      color: SOFT_SLATE.textPrimary,
                    }}
                  />

                  <button
                    type="button"
                    className="scanity-scanner-button"
                    onClick={handleManualScan}
                    disabled={scanStatus === "processing" || scanStatus === "captured" || scanStatus === "camera-loading"}
                    style={{
                      height: 48,
                      padding: "0 20px",
                      border: "none",
                      borderRadius: 14,
                      background: SOFT_SLATE.green,
                      color: "#ffffff",
                      fontWeight: 700,
                      fontSize: 11,
                      cursor: "pointer",
                      boxShadow: SOFT_SLATE.raisedBtn,
                      opacity:
                        scanStatus === "processing" || scanStatus === "captured" || scanStatus === "camera-loading"
                          ? 0.5
                          : 1,
                    }}
                  >
                    Scan
                  </button>
                </div>

                {scanStatus === "invalid" && (
                  <p style={{ margin: "9px 0 0", fontSize: 9, color: SOFT_SLATE.unsafe, lineHeight: 1.5 }}>
                    <i className="fa fa-exclamation-circle" style={{ marginRight: 5 }} />
                    {errorMessage}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Center>
      </div>

      {/* ── Help modal ───────────────────────────────────────────────────── */}
      {showHelp && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(36,41,47,0.45)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 430,
              background: SOFT_SLATE.bg,
              borderRadius: 26,
              padding: 26,
              boxShadow: SOFT_SLATE.raisedLg,
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: 18, color: SOFT_SLATE.textPrimary }}>How to scan</h3>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: "none",
                  background: SOFT_SLATE.bg,
                  boxShadow: SOFT_SLATE.raisedSm,
                  cursor: "pointer",
                  color: SOFT_SLATE.textMuted,
                }}
              >
                <i className="fa fa-times" />
              </button>
            </div>

            {[
              "Tap Camera or Start Camera.",
              "Allow camera permission when your browser asks.",
              "Place the barcode inside the scanning frame.",
              "Keep the barcode steady until it is detected.",
              "Scanity will validate the barcode.",
              "The barcode will be sent to the backend.",
              "The backend retrieves product information from OpenFoodFacts.",
              "The Product Result page will display the returned information.",
            ].map((instruction, index) => (
              <div key={instruction} style={{ display: "flex", gap: 12, marginBottom: 13 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    flexShrink: 0,
                    borderRadius: "50%",
                    background: SOFT_SLATE.bg,
                    boxShadow: SOFT_SLATE.insetSm,
                    color: SOFT_SLATE.green,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 800,
                  }}
                >
                  {index + 1}
                </div>
                <span style={{ fontSize: 10, lineHeight: 1.6, color: SOFT_SLATE.textMuted }}>{instruction}</span>
              </div>
            ))}

            <button
              type="button"
              className="scanity-scanner-button"
              onClick={() => setShowHelp(false)}
              style={{
                width: "100%",
                marginTop: 10,
                padding: 14,
                border: "none",
                borderRadius: 15,
                background: SOFT_SLATE.green,
                color: "#ffffff",
                fontWeight: 700,
                fontSize: 11,
                cursor: "pointer",
                boxShadow: SOFT_SLATE.raisedBtn,
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Logout confirmation ──────────────────────────────────────────── */}
      {showLogoutConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(36,41,47,0.45)",
            zIndex: 210,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 390,
              background: SOFT_SLATE.bg,
              borderRadius: 26,
              padding: 26,
              textAlign: "center",
              boxShadow: SOFT_SLATE.raisedLg,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: "50%",
                background: STATUS_TINTS.unsafe.bg,
                color: STATUS_TINTS.unsafe.fg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 14px",
              }}
            >
              <i className="fa fa-sign-out" style={{ fontSize: 22 }} />
            </div>

            <h3 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: SOFT_SLATE.textPrimary }}>
              Are you sure you want to logout?
            </h3>
            <p style={{ margin: "8px 0 20px", fontSize: 10, lineHeight: 1.6, color: SOFT_SLATE.textMuted }}>
              You will be returned to the login screen.
            </p>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="scanity-scanner-button"
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  flex: 1,
                  padding: 14,
                  border: "none",
                  borderRadius: 15,
                  background: SOFT_SLATE.bg,
                  color: SOFT_SLATE.textPrimary,
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: "pointer",
                  boxShadow: SOFT_SLATE.raisedBtnAlt,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="scanity-scanner-button"
                onClick={handleLogout}
                style={{
                  flex: 1,
                  padding: 14,
                  border: "none",
                  borderRadius: 15,
                  background: SOFT_SLATE.unsafe,
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: "pointer",
                  boxShadow: SOFT_SLATE.raisedBtn,
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Logout loading ───────────────────────────────────────────────── */}
      {showLogoutLoading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(36,41,47,0.55)",
            zIndex: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 260,
              background: SOFT_SLATE.bg,
              borderRadius: 22,
              padding: 26,
              textAlign: "center",
              boxShadow: SOFT_SLATE.raisedLg,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "4px solid #c6ccd4",
                borderTopColor: SOFT_SLATE.green,
                animation: "scanitySpin 0.8s linear infinite",
                margin: "0 auto 14px",
              }}
            />
            <strong style={{ fontSize: 14, color: SOFT_SLATE.textPrimary }}>Logging out...</strong>
          </div>
        </div>
      )}
    </div>
  )
}

// ── OCR Scanner Screen — Soft Slate (neumorphic) ────────────────────────────
// Restyled to match DashboardScreen's neumorphism: same SOFT_SLATE tokens,
// same DashboardIconRail nav (instead of AppSidebar), raised panels/buttons,
// inset wells for camera + inputs. All state, handlers, camera/OCR/product
// logic are unchanged from the original — only the render layer changed.
//
// Depends on things already defined in the Dashboard section of this file:
// SOFT_SLATE, DashboardIconRail, DASHBOARD_RAIL_ITEMS. Drop this in wherever
// OCRScannerScreen currently lives; no new tokens needed.

function OCRScannerScreen({ go }: { go: (s: Screen) => void }) {
  const [showHelp, setShowHelp] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showLogoutLoading, setShowLogoutLoading] = useState(false)

  const [scanStatus, setScanStatus] = useState<
    "ready" | "scanning" | "captured" | "ocrProcessing" | "textPreview" | "productProcessing" | "error"
  >("ready")

  const [extractedText, setExtractedText] = useState("")
  const [ingredients, setIngredients] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState("")

  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment")
  const [flashOn, setFlashOn] = useState(false)
  const [galleryImage, setGalleryImage] = useState<string | null>(null)

  const [productName, setProductName] = useState("")
  const [productFound, setProductFound] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processingRef = useRef(false)

  const isDesktop = useIsDesktop()

  // ── CAMERA ──────────────────────────────────────────────────────────────
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
    setFlashOn(false)
  }

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  const startCamera = async (requestedFacing?: "environment" | "user") => {
    try {
      setErrorMessage("")
      setGalleryImage(null)
      stopCamera()

      if (!window.isSecureContext) {
        throw new Error("Camera requires HTTPS or localhost. Open Scanity using localhost or HTTPS.")
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera access is not supported by this browser. Please use Google Chrome, Microsoft Edge, or Safari.")
      }

      setScanStatus("scanning")

      const facing = requestedFacing ?? cameraFacing
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })

      streamRef.current = stream
      if (!videoRef.current) throw new Error("Camera preview could not be initialized.")

      videoRef.current.srcObject = stream
      videoRef.current.muted = true
      videoRef.current.playsInline = true
      await videoRef.current.play()
    } catch (error) {
      console.error("Camera error:", error)
      let message = "Camera access was denied or the camera is unavailable."
      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") message = "Camera permission was denied. Allow camera access in your browser settings and try again."
        else if (error.name === "NotFoundError") message = "No camera was found on this device."
        else if (error.name === "NotReadableError") message = "The camera is already being used by another application."
      } else if (error instanceof Error) {
        message = error.message
      }
      setErrorMessage(message)
      setScanStatus("error")
      stopCamera()
    }
  }

  const rotateCamera = async () => {
    const nextFacing = cameraFacing === "environment" ? "user" : "environment"
    setCameraFacing(nextFacing)
    if (scanStatus === "scanning") await startCamera(nextFacing)
  }

  const toggleFlash = async () => {
    const stream = streamRef.current
    if (!stream) {
      setErrorMessage("Start the camera first before using the flash.")
      return
    }
    const track = stream.getVideoTracks()[0]
    if (!track) return

    try {
      const capabilities = typeof track.getCapabilities === "function" ? track.getCapabilities() : null
      if (!(capabilities as any)?.torch) {
        setErrorMessage("Flash is not supported by this camera.")
        return
      }
      const nextFlash = !flashOn
      await track.applyConstraints({ advanced: [{ torch: nextFlash } as any] })
      setFlashOn(nextFlash)
      setErrorMessage("")
    } catch (error) {
      console.error("Flash error:", error)
      setErrorMessage("The flash could not be controlled on this device.")
    }
  }

  const captureCameraFrame = async () => {
    const video = videoRef.current
    if (!video) throw new Error("Camera preview could not be initialized.")
    if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) throw new Error("The camera is not ready yet. Please try again.")

    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) throw new Error("Unable to capture the camera image.")

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Unable to process the camera image.")

    if (cameraFacing === "user") {
      context.translate(width, 0)
      context.scale(-1, 1)
    }
    context.drawImage(video, 0, 0, width, height)
    return canvas
  }

  // ── PARSE INGREDIENTS ──────────────────────────────────────────────────
  const parseIngredients = (text: string) => {
    const lower = text.toLowerCase()
    const ingredientIndex = lower.indexOf("ingredients")
    if (ingredientIndex === -1) return []

    let ingredientText = text.substring(ingredientIndex)
    ingredientText = ingredientText.replace(/^ingredients?\s*:?\s*/i, "")

    const stopWords = ["nutrition facts", "nutrition information", "allergen", "contains", "serving size", "calories"]
    for (const stopWord of stopWords) {
      const index = ingredientText.toLowerCase().indexOf(stopWord)
      if (index > 0) ingredientText = ingredientText.substring(0, index)
    }

    return ingredientText
      .split(/[,;\n]/)
      .map((item) => item.replace(/[•*]/g, "").trim())
      .filter((item) => item.length > 1 && item.length < 100)
      .slice(0, 30)
  }

  // ── OCR PROCESS ─────────────────────────────────────────────────────────
  const processOCR = async (source: string | HTMLCanvasElement | File) => {
    if (processingRef.current) return
    processingRef.current = true

    try {
      setErrorMessage("")
      stopCamera()
      setScanStatus("captured")
      await new Promise((resolve) => setTimeout(resolve, 700))

      setScanStatus("ocrProcessing")
      const worker = await createWorker("eng")
      const result = await worker.recognize(source)
      const text = result?.data?.text?.trim() || ""
      await worker.terminate()

      if (!text) throw new Error("No text was detected. Please make sure the nutrition label is clear and readable.")

      const parsedIngredients = parseIngredients(text)
      setExtractedText(text)
      setIngredients(parsedIngredients)

      try {
        localStorage.setItem(
          "scanityOCRResult",
          JSON.stringify({ text, ingredients: parsedIngredients, source: "ocr", scannedAt: new Date().toISOString() })
        )
      } catch (error) {
        console.warn("Unable to save OCR result:", error)
      }

      await new Promise((resolve) => setTimeout(resolve, 500))
      setScanStatus("textPreview")
    } catch (error) {
      console.error("OCR processing error:", error)
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong while reading the nutrition label.")
      setScanStatus("error")
      stopCamera()
    } finally {
      processingRef.current = false
    }
  }

  const handleCapture = async () => {
    if (processingRef.current) return
    if (!streamRef.current) {
      setErrorMessage("Start the camera first before scanning.")
      return
    }
    try {
      setErrorMessage("")
      const canvas = await captureCameraFrame()
      await processOCR(canvas)
    } catch (error) {
      console.error("OCR capture error:", error)
      setErrorMessage(error instanceof Error ? error.message : "Unable to capture the nutrition label.")
      setScanStatus("error")
    }
  }

  const handleGallery = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please select a valid image.")
      event.target.value = ""
      return
    }
    if (processingRef.current) return

    try {
      setErrorMessage("")
      stopCamera()
      const imageUrl = URL.createObjectURL(file)
      setGalleryImage(imageUrl)
      await processOCR(file)
    } catch (error) {
      console.error("Gallery OCR error:", error)
      setErrorMessage(error instanceof Error ? error.message : "Unable to read the selected image.")
      setScanStatus("error")
    }
    event.target.value = ""
  }

  const addIngredient = () => setIngredients([...ingredients, ""])
  const updateIngredient = (index: number, value: string) => {
    const updated = [...ingredients]
    updated[index] = value
    setIngredients(updated)
  }
  const removeIngredient = (index: number) => setIngredients(ingredients.filter((_, i) => i !== index))

  // ── PRODUCT LOOKUP ─────────────────────────────────────────────────────
  const lookupProductFromOCR = async () => {
    if (processingRef.current) return
    processingRef.current = true

    try {
      setErrorMessage("")
      setScanStatus("productProcessing")

      const combinedText = `${extractedText} ${ingredients.join(" ")}`.toLowerCase()
      await new Promise((resolve) => setTimeout(resolve, 1600))

      let product = {
        name: "Sample Nutrition Product",
        brand: "Scanity Demo",
        category: "Food Product",
        score: 85,
        status: "Safe",
        calories: "120 kcal",
        sugar: "8 g",
        sodium: "90 mg",
        protein: "4 g",
        ingredients: ingredients.length > 0 ? ingredients : ["Water", "Sugar", "Milk"],
      }

      if (combinedText.includes("milk") || combinedText.includes("fresh milk")) {
        product = {
          name: "Fresh Milk", brand: "Sample Brand", category: "Dairy", score: 87, status: "Safe",
          calories: "120 kcal", sugar: "8 g", sodium: "90 mg", protein: "4 g",
          ingredients: ingredients.length > 0 ? ingredients : ["Milk", "Water", "Vitamin A", "Vitamin D"],
        }
      } else if (combinedText.includes("juice") || combinedText.includes("orange")) {
        product = {
          name: "Orange Juice", brand: "Sample Brand", category: "Beverage", score: 72, status: "Fair",
          calories: "110 kcal", sugar: "22 g", sodium: "10 mg", protein: "1 g",
          ingredients: ingredients.length > 0 ? ingredients : ["Orange Juice", "Water", "Sugar", "Citric Acid"],
        }
      } else if (combinedText.includes("chocolate") || combinedText.includes("cocoa")) {
        product = {
          name: "Chocolate Snack", brand: "Sample Brand", category: "Snack", score: 62, status: "Caution",
          calories: "210 kcal", sugar: "18 g", sodium: "80 mg", protein: "3 g",
          ingredients: ingredients.length > 0 ? ingredients : ["Sugar", "Cocoa", "Milk", "Wheat"],
        }
      }

      const productResult = {
        ...product,
        source: "ocr",
        extractedText,
        ingredients: product.ingredients,
        scannedAt: new Date().toISOString(),
        allergyStatus: "Checking allergies...",
        healthAnalysis:
          product.score >= 80
            ? "This product has a generally good nutrition profile."
            : product.score >= 60
              ? "This product is acceptable but should be consumed in moderation."
              : "This product should be consumed carefully.",
      }

      localStorage.setItem("scanityProductResult", JSON.stringify(productResult))
      localStorage.setItem("scanityLastScan", JSON.stringify(productResult))

      setProductName(product.name)
      setProductFound(true)

      await new Promise((resolve) => setTimeout(resolve, 500))
      go("productResult")
    } catch (error) {
      console.error("Product lookup error:", error)
      setErrorMessage(error instanceof Error ? error.message : "Unable to analyze this product.")
      setScanStatus("error")
    } finally {
      processingRef.current = false
    }
  }

  const handleRetry = () => {
    stopCamera()
    setErrorMessage("")
    setExtractedText("")
    setIngredients([])
    setGalleryImage(null)
    setProductName("")
    setProductFound(false)
    setScanStatus("ready")
  }

  const handleLogout = () => {
    setShowLogoutConfirm(false)
    setShowLogoutLoading(true)
    stopCamera()
    setTimeout(() => {
      setShowLogoutLoading(false)
      go("splash")
    }, 1800)
  }

  const getStatusTitle = () => {
    switch (scanStatus) {
      case "scanning": return "Ready to capture"
      case "captured": return "Image captured"
      case "ocrProcessing": return "Reading Nutrition Label..."
      case "textPreview": return "Review Extracted Information"
      case "productProcessing": return "Analyzing Product..."
      case "error": return "Unable to scan"
      default: return "Ready to scan"
    }
  }

  const getStatusDescription = () => {
    switch (scanStatus) {
      case "scanning": return "Position the nutrition label clearly inside the frame, then tap Capture."
      case "captured": return "Your nutrition label image has been captured."
      case "ocrProcessing": return "Scanity is reading the text from your nutrition label."
      case "textPreview": return "Review the extracted ingredients before continuing with product analysis."
      case "productProcessing": return "Scanity is analyzing the product, nutrition information, and allergies."
      case "error": return errorMessage || "Please try scanning again."
      default: return "Scan a nutrition label to extract ingredients and nutritional information."
    }
  }

  const scannerBusy = scanStatus === "captured" || scanStatus === "ocrProcessing" || scanStatus === "productProcessing"

  // ── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background: SOFT_SLATE.bg,
        fontFamily: SOFT_SLATE.fontFamily,
      }}
    >
      <style>
        {`
          @keyframes scanityScanLine { 0% { top: 10%; opacity: 0.4; } 50% { top: 85%; opacity: 1; } 100% { top: 10%; opacity: 0.4; } }
          @keyframes scanitySpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes scanityPulse { 0% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 0.7; } }
          .scanity-slate-btn { transition: transform 0.15s ease, box-shadow 0.15s ease; }
          .scanity-slate-btn:hover:not(:disabled) { transform: translateY(-1px); }
          .scanity-slate-btn:active:not(:disabled) { transform: scale(0.97); }
          .scanity-slate-input { outline: none; transition: box-shadow 0.15s ease; }
          .scanity-slate-input:focus { box-shadow: inset 5px 5px 11px #c6ccd4, inset -5px -5px 11px #ffffff, 0 0 0 3px rgba(30,107,63,0.18) !important; }
        `}
      </style>

      {/* ── Icon rail (desktop, fixed) ───────────────────────────────────── */}
      {isDesktop && (
        <div style={{ position: "fixed", top: 22, left: 26, bottom: 22, width: 80, zIndex: 5 }}>
          <DashboardIconRail go={go} isDesktop />
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          paddingTop: SAFE_TOP,
          boxSizing: "border-box",
          marginLeft: isDesktop ? 80 + 26 + 26 : 0,
        }}
      >
        <Center maxWidth={isDesktop ? 1100 : undefined}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 22,
              padding: isDesktop ? "26px 40px 26px 0" : "16px 14px",
              boxSizing: "border-box",
              color: SOFT_SLATE.textPrimary,
              minWidth: 0,
            }}
          >
            {!isDesktop && <DashboardIconRail go={go} isDesktop={false} />}

            {/* ── Header ──────────────────────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
              <div>
                <div style={{ fontSize: isDesktop ? 26 : 21, fontWeight: 800, letterSpacing: "-0.02em", color: SOFT_SLATE.textPrimary }}>
                  Nutrition Label Scanner
                </div>
                <div style={{ fontSize: 13, color: SOFT_SLATE.textSecondary, marginTop: 4 }}>
                  Scan a nutrition label to extract ingredients
                </div>
              </div>

              <Tooltip label="How to scan">
                <button
                  type="button"
                  className="scanity-slate-btn"
                  onClick={() => setShowHelp(true)}
                  aria-label="Help"
                  style={{
                    width: 42, height: 42, borderRadius: 14, border: "none",
                    background: SOFT_SLATE.bg, boxShadow: SOFT_SLATE.raisedSm,
                    color: SOFT_SLATE.green, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}
                >
                  <i className="fa fa-question" style={{ fontSize: 15 }} />
                </button>
              </Tooltip>
            </div>

            {/* ── Text preview / ingredient editor ───────────────────────── */}
            {scanStatus === "textPreview" ? (
              <section
                style={{
                  background: SOFT_SLATE.bg,
                  borderRadius: 26,
                  padding: isDesktop ? 28 : 20,
                  boxShadow: SOFT_SLATE.raisedLg,
                  boxSizing: "border-box",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div
                    style={{
                      width: 48, height: 48, borderRadius: 15,
                      background: SOFT_SLATE.bg, boxShadow: SOFT_SLATE.insetMd,
                      color: SOFT_SLATE.green,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}
                  >
                    <i className="fa fa-check" style={{ fontSize: 19 }} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
                      Text Extracted Successfully
                    </h2>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: SOFT_SLATE.textMuted }}>
                      Review the information before product analysis.
                    </p>
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", marginBottom: 8, fontSize: 11.5, fontWeight: 700, color: SOFT_SLATE.textPrimary }}>
                    Extracted Text
                  </label>
                  <textarea
                    className="scanity-slate-input"
                    value={extractedText}
                    onChange={(event) => setExtractedText(event.target.value)}
                    style={{
                      width: "100%", minHeight: 150, resize: "vertical", boxSizing: "border-box",
                      padding: 14, border: "none", borderRadius: 16,
                      background: SOFT_SLATE.bg, boxShadow: SOFT_SLATE.insetMd,
                      fontFamily: SOFT_SLATE.fontFamily, fontSize: 12, lineHeight: 1.6, color: SOFT_SLATE.textPrimary,
                    }}
                  />
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: SOFT_SLATE.textPrimary }}>
                        Ingredients
                      </label>
                      <span style={{ fontSize: 10, color: SOFT_SLATE.textMuted }}>
                        You can edit the extracted ingredients.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="scanity-slate-btn"
                      onClick={addIngredient}
                      style={{
                        border: "none", borderRadius: 12, background: SOFT_SLATE.bg,
                        boxShadow: SOFT_SLATE.raisedSm, color: SOFT_SLATE.green,
                        padding: "9px 13px", fontSize: 10.5, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      <i className="fa fa-plus" style={{ marginRight: 5 }} />
                      Add
                    </button>
                  </div>

                  {ingredients.length === 0 ? (
                    <div
                      style={{
                        padding: 18, borderRadius: 16, textAlign: "center",
                        background: SOFT_SLATE.bg, boxShadow: SOFT_SLATE.insetSm,
                        fontSize: 11, color: SOFT_SLATE.textMuted,
                      }}
                    >
                      No ingredients were automatically detected. You can add them manually.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {ingredients.map((ingredient, index) => (
                        <div key={`${index}-${ingredient}`} style={{ display: "flex", gap: 8 }}>
                          <input
                            className="scanity-slate-input"
                            value={ingredient}
                            onChange={(event) => updateIngredient(index, event.target.value)}
                            placeholder={`Ingredient ${index + 1}`}
                            style={{
                              flex: 1, minWidth: 0, padding: "11px 13px", border: "none", borderRadius: 12,
                              background: SOFT_SLATE.bg, boxShadow: SOFT_SLATE.insetSm,
                              fontFamily: SOFT_SLATE.fontFamily, fontSize: 11, color: SOFT_SLATE.textPrimary,
                            }}
                          />
                          <button
                            type="button"
                            className="scanity-slate-btn"
                            onClick={() => removeIngredient(index)}
                            style={{
                              width: 40, flexShrink: 0, border: "none", borderRadius: 12,
                              background: SOFT_SLATE.bg, boxShadow: SOFT_SLATE.raisedSm,
                              color: SOFT_SLATE.unsafe, cursor: "pointer",
                            }}
                          >
                            <i className="fa fa-trash" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 14, marginTop: 25 }}>
                  <button
                    type="button"
                    className="scanity-slate-btn"
                    onClick={handleRetry}
                    style={{
                      flex: 1, padding: 15, border: "none", borderRadius: 16,
                      background: SOFT_SLATE.bg, boxShadow: SOFT_SLATE.raisedBtnAlt,
                      color: "#4a5158", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    Scan Again
                  </button>
                  <button
                    type="button"
                    className="scanity-slate-btn"
                    onClick={lookupProductFromOCR}
                    style={{
                      flex: 2, padding: 15, border: "none", borderRadius: 16,
                      background: SOFT_SLATE.green, boxShadow: SOFT_SLATE.raisedBtn,
                      color: "#ffffff", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    <i className="fa fa-search" style={{ marginRight: 7 }} />
                    Analyze Product
                  </button>
                </div>
              </section>
            ) : (
              <section
                style={{
                  background: SOFT_SLATE.bg,
                  borderRadius: 26,
                  padding: isDesktop ? 20 : 16,
                  boxShadow: SOFT_SLATE.raisedLg,
                  boxSizing: "border-box",
                }}
              >
                {/* Camera well — inset like the barcode reader on Dashboard */}
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: isDesktop ? 900 : 640,
                    height: isDesktop ? 500 : 280,
                    margin: "0 auto",
                    background: "#111111",
                    borderRadius: 20,
                    overflow: "hidden",
                    boxShadow: SOFT_SLATE.insetLg,
                  }}
                >
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    autoPlay
                    style={{
                      position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
                      transform: cameraFacing === "user" ? "scaleX(-1)" : "none",
                      display: scannerBusy ? "none" : "block",
                    }}
                  />

                  {galleryImage && scanStatus !== "ready" && (
                    <img
                      src={galleryImage}
                      alt="Selected nutrition label"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#111111" }}
                    />
                  )}

                  {scanStatus === "ready" && !galleryImage && (
                    <div
                      style={{
                        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", textAlign: "center", padding: 20, color: "#ffffff",
                      }}
                    >
                      <div
                        style={{
                          width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.12)",
                          display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
                        }}
                      >
                        <i className="fa fa-camera" style={{ fontSize: 26 }} />
                      </div>
                      <strong style={{ fontSize: 16, fontWeight: 800 }}>Camera ready</strong>
                      <span style={{ marginTop: 7, fontSize: 11, color: "rgba(255,255,255,0.70)" }}>
                        Tap Camera to begin
                      </span>
                    </div>
                  )}

                  {scanStatus === "scanning" && (
                    <>
                      <div
                        style={{
                          position: "absolute", left: "50%", top: "50%",
                          width: isDesktop ? "68%" : "76%", height: isDesktop ? "55%" : "52%",
                          transform: "translate(-50%, -50%)",
                          border: "2px solid rgba(255,255,255,0.90)", borderRadius: 18,
                          boxShadow: "0 0 0 9999px rgba(0,0,0,0.32)",
                        }}
                      >
                        <span style={{ position: "absolute", left: -2, top: -2, width: 32, height: 32, borderTop: `4px solid ${SOFT_SLATE.gold}`, borderLeft: `4px solid ${SOFT_SLATE.gold}`, borderRadius: "10px 0 0 0" }} />
                        <span style={{ position: "absolute", right: -2, top: -2, width: 32, height: 32, borderTop: `4px solid ${SOFT_SLATE.gold}`, borderRight: `4px solid ${SOFT_SLATE.gold}`, borderRadius: "0 10px 0 0" }} />
                        <span style={{ position: "absolute", left: -2, bottom: -2, width: 32, height: 32, borderBottom: `4px solid ${SOFT_SLATE.gold}`, borderLeft: `4px solid ${SOFT_SLATE.gold}`, borderRadius: "0 0 0 10px" }} />
                        <span style={{ position: "absolute", right: -2, bottom: -2, width: 32, height: 32, borderBottom: `4px solid ${SOFT_SLATE.gold}`, borderRight: `4px solid ${SOFT_SLATE.gold}`, borderRadius: "0 0 10px 0" }} />
                        <span
                          style={{
                            position: "absolute", left: "4%", right: "4%", height: 2,
                            background: SOFT_SLATE.gold, boxShadow: "0 0 10px rgba(216,160,42,0.90)",
                            animation: "scanityScanLine 2s ease-in-out infinite",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          position: "absolute", bottom: 18, left: 0, right: 0, textAlign: "center",
                          color: "#ffffff", fontSize: 11, fontWeight: 600, textShadow: "0 1px 5px rgba(0,0,0,0.8)",
                        }}
                      >
                        Position the nutrition label inside the frame
                      </div>
                    </>
                  )}

                  {scanStatus === "captured" && (
                    <div
                      style={{
                        position: "absolute", inset: 0, background: "rgba(30,107,63,0.95)",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        color: "#ffffff", textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 68, height: 68, borderRadius: "50%", background: "#ffffff", color: SOFT_SLATE.green,
                          display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
                        }}
                      >
                        <i className="fa fa-check" style={{ fontSize: 32 }} />
                      </div>
                      <strong style={{ fontSize: 18, fontWeight: 800 }}>Image Captured</strong>
                      <span style={{ marginTop: 7, fontSize: 12 }}>Preparing OCR analysis...</span>
                    </div>
                  )}

                  {scanStatus === "ocrProcessing" && (
                    <div
                      style={{
                        position: "absolute", inset: 0, background: "rgba(233,237,242,0.97)",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 56, height: 56, borderRadius: "50%", border: "5px solid #c6ccd4",
                          borderTopColor: SOFT_SLATE.green, animation: "scanitySpin 0.8s linear infinite", marginBottom: 18,
                        }}
                      />
                      <div
                        style={{
                          width: 44, height: 44, borderRadius: "50%", background: SOFT_SLATE.bg, boxShadow: SOFT_SLATE.insetSm,
                          color: SOFT_SLATE.green, display: "flex", alignItems: "center", justifyContent: "center",
                          marginBottom: 12, animation: "scanityPulse 1.4s ease-in-out infinite",
                        }}
                      >
                        <i className="fa fa-file-text-o" style={{ fontSize: 18 }} />
                      </div>
                      <strong style={{ fontSize: isDesktop ? 19 : 16, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
                        Reading Nutrition Label...
                      </strong>
                      <span style={{ maxWidth: 390, marginTop: 8, padding: "0 20px", fontSize: 11, lineHeight: 1.6, color: SOFT_SLATE.textMuted }}>
                        Scanity is extracting text and ingredients from the nutrition label.
                      </span>
                    </div>
                  )}

                  {scanStatus === "productProcessing" && (
                    <div
                      style={{
                        position: "absolute", inset: 0, background: "rgba(233,237,242,0.97)",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 56, height: 56, borderRadius: "50%", border: "5px solid #c6ccd4",
                          borderTopColor: SOFT_SLATE.green, animation: "scanitySpin 0.8s linear infinite", marginBottom: 18,
                        }}
                      />
                      <strong style={{ fontSize: isDesktop ? 19 : 16, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
                        Analyzing Product...
                      </strong>
                      <span style={{ maxWidth: 390, marginTop: 8, padding: "0 20px", fontSize: 11, lineHeight: 1.6, color: SOFT_SLATE.textMuted }}>
                        Checking product information, nutrition, health score, and allergies.
                      </span>
                      <div style={{ display: "flex", gap: 6, marginTop: 18 }}>
                        {[0, 1, 2].map((item) => (
                          <span
                            key={item}
                            style={{
                              width: 6, height: 6, borderRadius: "50%", background: SOFT_SLATE.green,
                              animation: `scanityPulse 1s ease-in-out ${item * 0.2}s infinite`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {scanStatus === "error" && (
                    <div
                      style={{
                        position: "absolute", inset: 0, background: "rgba(233,237,242,0.97)",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        textAlign: "center", padding: 25,
                      }}
                    >
                      <div
                        style={{
                          width: 60, height: 60, borderRadius: "50%", background: "#F1DEDA", color: SOFT_SLATE.unsafe,
                          display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 13,
                        }}
                      >
                        <i className="fa fa-exclamation" style={{ fontSize: 23 }} />
                      </div>
                      <strong style={{ fontSize: 16, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>Unable to scan</strong>
                      <span style={{ maxWidth: 440, marginTop: 8, fontSize: 11, lineHeight: 1.6, color: SOFT_SLATE.textMuted }}>
                        {errorMessage}
                      </span>
                      <button
                        type="button"
                        className="scanity-slate-btn"
                        onClick={handleRetry}
                        style={{
                          marginTop: 17, padding: "11px 20px", border: "none", borderRadius: 14,
                          background: SOFT_SLATE.green, boxShadow: SOFT_SLATE.raisedBtn,
                          color: "#ffffff", fontWeight: 700, fontSize: 12, cursor: "pointer",
                        }}
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </div>

                {/* Status */}
                <div style={{ textAlign: "center", marginTop: 19 }}>
                  <h2 style={{ margin: 0, fontWeight: 800, fontSize: isDesktop ? 19 : 17, color: SOFT_SLATE.textPrimary }}>
                    {getStatusTitle()}
                  </h2>
                  <p style={{ maxWidth: 530, margin: "7px auto 0", fontSize: 11, lineHeight: 1.6, color: SOFT_SLATE.textMuted }}>
                    {getStatusDescription()}
                  </p>
                </div>

                {/* Controls — raised neumorphic squares, like the rail icons */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, maxWidth: 560, margin: "20px auto 0" }}>
                  <button
                    type="button"
                    className="scanity-slate-btn"
                    onClick={() => startCamera()}
                    disabled={scannerBusy}
                    style={{
                      border: "none", background: SOFT_SLATE.bg, borderRadius: 16,
                      padding: isDesktop ? "15px 8px" : "13px 5px",
                      boxShadow: scannerBusy ? SOFT_SLATE.insetSm : SOFT_SLATE.raisedSm,
                      color: SOFT_SLATE.green, cursor: scannerBusy ? "not-allowed" : "pointer",
                      opacity: scannerBusy ? 0.55 : 1,
                    }}
                  >
                    <i className="fa fa-camera" style={{ fontSize: 17 }} />
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 9.5 }}>Camera</div>
                  </button>

                  <button
                    type="button"
                    className="scanity-slate-btn"
                    onClick={rotateCamera}
                    disabled={scannerBusy}
                    style={{
                      border: "none", background: SOFT_SLATE.bg, borderRadius: 16,
                      padding: isDesktop ? "15px 8px" : "13px 5px",
                      boxShadow: scannerBusy ? SOFT_SLATE.insetSm : SOFT_SLATE.raisedSm,
                      color: SOFT_SLATE.green, cursor: scannerBusy ? "not-allowed" : "pointer",
                      opacity: scannerBusy ? 0.55 : 1,
                    }}
                  >
                    <i className="fa fa-refresh" style={{ fontSize: 17 }} />
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 9.5 }}>Rotate</div>
                  </button>

                  <label
                    className="scanity-slate-btn"
                    style={{
                      border: "none", background: SOFT_SLATE.bg, borderRadius: 16,
                      padding: isDesktop ? "15px 8px" : "13px 5px",
                      boxShadow: scannerBusy ? SOFT_SLATE.insetSm : SOFT_SLATE.raisedSm,
                      color: SOFT_SLATE.green, cursor: scannerBusy ? "not-allowed" : "pointer",
                      textAlign: "center", opacity: scannerBusy ? 0.55 : 1,
                    }}
                  >
                    <i className="fa fa-picture-o" style={{ fontSize: 17 }} />
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 9.5 }}>Gallery</div>
                    <input type="file" accept="image/*" onChange={handleGallery} disabled={scannerBusy} style={{ display: "none" }} />
                  </label>

                  <button
                    type="button"
                    className="scanity-slate-btn"
                    onClick={toggleFlash}
                    disabled={scanStatus !== "scanning"}
                    style={{
                      border: "none", borderRadius: 16,
                      background: SOFT_SLATE.bg,
                      padding: isDesktop ? "15px 8px" : "13px 5px",
                      boxShadow: scanStatus !== "scanning" ? SOFT_SLATE.insetSm : flashOn ? SOFT_SLATE.insetMd : SOFT_SLATE.raisedSm,
                      color: flashOn ? SOFT_SLATE.gold : SOFT_SLATE.green,
                      cursor: scanStatus !== "scanning" ? "not-allowed" : "pointer",
                      opacity: scanStatus !== "scanning" ? 0.55 : 1,
                    }}
                  >
                    <i className="fa fa-bolt" style={{ fontSize: 17 }} />
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 9.5 }}>Flash</div>
                  </button>
                </div>

                {scanStatus === "scanning" && (
                  <button
                    type="button"
                    className="scanity-slate-btn"
                    onClick={handleCapture}
                    style={{
                      display: "block", width: "100%", maxWidth: 560, margin: "18px auto 0", padding: 16,
                      border: "none", borderRadius: 16, background: SOFT_SLATE.green,
                      boxShadow: SOFT_SLATE.raisedBtn, color: "#ffffff", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                    }}
                  >
                    <i className="fa fa-camera" style={{ marginRight: 8 }} />
                    Capture Nutrition Label
                  </button>
                )}
              </section>
            )}
          </div>
        </Center>
      </div>

      {/* ── Help modal ──────────────────────────────────────────────────── */}
      {showHelp && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(36,41,47,0.45)", zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            style={{
              width: "100%", maxWidth: 430, background: SOFT_SLATE.bg, borderRadius: 26, padding: 26,
              boxShadow: "16px 16px 34px #b8bfc8, -16px -16px 34px #ffffff",
            }}
          >
            <h3 style={{ margin: "0 0 18px", fontWeight: 800, fontSize: 18, color: SOFT_SLATE.textPrimary }}>
              How to scan
            </h3>

            {[
              "Tap Camera.",
              "Allow camera permission.",
              "Place the nutrition label inside the frame.",
              "Tap Capture Nutrition Label.",
              "Review the extracted text and ingredients.",
              "Tap Analyze Product.",
              "Scanity will show the product result and allergy status.",
            ].map((instruction, index) => (
              <div key={instruction} style={{ display: "flex", gap: 11, marginBottom: 12 }}>
                <div
                  style={{
                    width: 25, height: 25, flexShrink: 0, borderRadius: "50%",
                    background: SOFT_SLATE.bg, boxShadow: SOFT_SLATE.insetSm, color: SOFT_SLATE.green,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800,
                  }}
                >
                  {index + 1}
                </div>
                <span style={{ fontSize: 11, lineHeight: 1.6, color: SOFT_SLATE.textSecondary }}>{instruction}</span>
              </div>
            ))}

            <button
              type="button"
              className="scanity-slate-btn"
              onClick={() => setShowHelp(false)}
              style={{
                width: "100%", marginTop: 8, padding: 14, border: "none", borderRadius: 16,
                background: SOFT_SLATE.green, boxShadow: SOFT_SLATE.raisedBtn,
                color: "#ffffff", fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Logout confirmation ─────────────────────────────────────────── */}
      {showLogoutConfirm && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(36,41,47,0.45)", zIndex: 210,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            style={{
              width: "100%", maxWidth: 390, background: SOFT_SLATE.bg, borderRadius: 26, padding: 26,
              textAlign: "center", boxShadow: "16px 16px 34px #b8bfc8, -16px -16px 34px #ffffff",
            }}
          >
            <div
              style={{
                width: 56, height: 56, borderRadius: "50%", background: "#F1DEDA", color: SOFT_SLATE.unsafe,
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px",
              }}
            >
              <i className="fa fa-sign-out" style={{ fontSize: 22 }} />
            </div>

            <h3 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: SOFT_SLATE.textPrimary }}>
              Are you sure you want to logout?
            </h3>
            <p style={{ margin: "8px 0 20px", fontSize: 11, color: SOFT_SLATE.textMuted }}>
              You will be returned to the login screen.
            </p>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                className="scanity-slate-btn"
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  flex: 1, padding: 14, border: "none", borderRadius: 14,
                  background: SOFT_SLATE.bg, boxShadow: SOFT_SLATE.raisedBtnAlt,
                  color: SOFT_SLATE.textPrimary, fontWeight: 700, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="scanity-slate-btn"
                onClick={handleLogout}
                style={{
                  flex: 1, padding: 14, border: "none", borderRadius: 14,
                  background: SOFT_SLATE.unsafe, boxShadow: SOFT_SLATE.raisedBtn,
                  color: "#ffffff", fontWeight: 700, cursor: "pointer",
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Logout loading ──────────────────────────────────────────────── */}
      {showLogoutLoading && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(36,41,47,0.55)", zIndex: 220,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 260, background: SOFT_SLATE.bg, borderRadius: 22, padding: 26, textAlign: "center",
              boxShadow: "16px 16px 34px #b8bfc8, -16px -16px 34px #ffffff",
            }}
          >
            <div
              style={{
                width: 40, height: 40, borderRadius: "50%", border: "4px solid #c6ccd4",
                borderTopColor: SOFT_SLATE.green, animation: "scanitySpin 0.8s linear infinite", margin: "0 auto 14px",
              }}
            />
            <strong style={{ fontSize: 14, color: SOFT_SLATE.textPrimary }}>Logging out...</strong>
          </div>
        </div>
      )}
    </div>
  )
}
// ── Product Result Screen ─────────────────────────────────────────────────────
function ProductResultScreen({ go }: { go: (s: Screen) => void }) {
  const isDesktop = useIsDesktop()

  // Nutrition grade (A–E) reflects ingredient/nutrition quality only — it is
  // calculated from the product itself and is never lowered just because an
  // ingredient happens to match this user's saved allergy profile. A product
  // can be Grade A and still be flagged unsafe for a specific person; that
  // personalized check is the separate Safety verdict below.
  const grade: NutritionGrade = "a"

  const verdict: CompareVerdict = "avoid"
  const verdictReason =
    "Flagged against your saved allergy profile — see allergens below."
  const allergens = ["wheat", "soy"]

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: C.offWhite,
        overflow: "hidden",
      }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div>
        <InfoHeader
          title="Product Result"
          subtitle="Scan analysis complete"
          go={go}
        />
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
        }}
      >
        <Center
          maxWidth={isDesktop ? 900 : 640}
          style={{
            padding: isDesktop
              ? "30px 40px 40px"
              : "0 16px 24px",
          }}
        >
          {/* ── Product Image ─────────────────────────────────────────────── */}
          <div
            style={{
              width: "100%",
              aspectRatio: "16/9",
              borderRadius: C.radiusLg ?? 16,
              background: C.white,
              border: `1.5px solid ${C.border}`,
              overflow: "hidden",
              marginBottom: 16,
            }}
          >
            <img
              src={beefNoodlesImg}
              alt="Noodles Beef"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>

          {/* ── Product Name + Grade ──────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontFamily: FONT_HEAD,
                  fontWeight: 700,
                  fontSize: 16,
                  color: C.black,
                }}
              >
                Noodles Beef
              </p>

              <p
                style={{
                  margin: 0,
                  fontFamily: FONT_BODY,
                  fontSize: 12,
                  color: "rgba(26,18,9,0.45)",
                  marginTop: 2,
                }}
              >
                Brand · 85g pack
              </p>
            </div>

            {/* Grade Badge */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
              }}
            >
              <GradeBadge grade={grade} size={56} />

              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "rgba(26,18,9,0.42)",
                }}
              >
                grade
              </span>
            </div>
          </div>

          {/* ── Grade Scale ──────────────────────────────────────────────── */}
          <div
            style={{
              marginBottom: 20,
            }}
          >
            <GradeScale grade={grade} />
          </div>

          {/* ── Allergy & Safety ─────────────────────────────────────────── */}
          <div
            style={{
              borderRadius: 14,
              background: C.white,
              border: `1.5px solid rgba(224,167,46,0.2)`,
              padding: "14px 16px",
              marginBottom: 24,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: FONT_HEAD,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "rgba(26,18,9,0.5)",
              }}
            >
              Allergy &amp; safety
            </p>

            <StatusBadge verdict={verdict} reason={verdictReason} size="lg" />

            <AllergenList allergens={allergens} />
          </div>

          {/* ── Action Buttons ────────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              gap: 12,
            }}
          >
            {/* SAVE */}
            <button
              type="button"
              style={{
                flex: 1,
                padding: "13px",
                borderRadius: 14,
                border: `1.5px solid rgba(224,167,46,0.4)`,
                background: "transparent",
                color: C.greenLight,
                fontFamily: FONT_HEAD,
                fontWeight: 400,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              SAVE
            </button>

            {/* COMPARE */}
            <button
              type="button"
              onClick={() => go("productCompare")}
              style={{
                flex: 1,
                padding: "13px",
                borderRadius: 14,
                border: "none",
                background:
                  "linear-gradient(135deg, #E0A72E, #C98A1F)",
                color: C.offWhite,
                fontFamily: FONT_HEAD,
                fontWeight: 400,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              COMPARE
            </button>
          </div>
        </Center>
      </div>
    </div>
  )
}

// ── Product Comparison ───────────────────────────────────────────────────────

// Nutrition Grade — a Nutri-Score-style A (best) to E (worst) letter grade
// for a product's overall ingredient/nutrition quality. It is computed from
// the product alone (nutrients, ingredients, processing) and is intentionally
// independent of any one user's saved allergies or health conditions — a
// product can be Grade A and still be unsafe for a specific person. Personal
// safety against that user's profile is the separate `CompareVerdict` below.
//
// Colors come from the dedicated --scanity-grade-* tokens in tokens.css
// (each aliased to an existing base token, so there is one source of truth
// per color) rather than reusing base tokens directly here.
type NutritionGrade = "a" | "b" | "c" | "d" | "e"

const GRADE_ORDER: NutritionGrade[] = ["a", "b", "c", "d", "e"]

const GRADE_COLORS: Record<NutritionGrade, string> = {
  a: "var(--scanity-grade-a)",
  b: "var(--scanity-grade-b)",
  c: "var(--scanity-grade-c)",
  d: "var(--scanity-grade-d)",
  e: "var(--scanity-grade-e)",
}

function gradeColor(grade: NutritionGrade | null): string {
  if (grade === null) {
    return "rgba(26,18,9,0.35)"
  }

  return GRADE_COLORS[grade]
}

function GradeBadge({
  grade,
  size = 56,
}: {
  grade: NutritionGrade | null
  size?: number
}) {
  const color = gradeColor(grade)

  return (
    <div
      role="img"
      aria-label={
        grade === null
          ? "Nutrition grade not available"
          : `Nutrition grade ${grade.toUpperCase()}`
      }
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: grade === null ? "rgba(26,18,9,0.08)" : color,
        border:
          grade === null
            ? "1.5px dashed rgba(26,18,9,0.25)"
            : "none",
      }}
    >
      <span
        style={{
          fontFamily: FONT_HEAD,
          fontWeight: 800,
          fontSize: grade === null ? size * 0.16 : size * 0.42,
          color: grade === null ? "rgba(26,18,9,0.4)" : C.white,
          lineHeight: 1,
        }}
      >
        {grade === null ? "N/A" : grade.toUpperCase()}
      </span>
    </div>
  )
}

function GradeScale({ grade }: { grade: NutritionGrade | null }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {GRADE_ORDER.map((g) => {
        const active = g === grade
        const color = GRADE_COLORS[g]

        return (
          <div
            key={g}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                width: "100%",
                height: 8,
                borderRadius: 4,
                background: color,
                opacity: active ? 1 : 0.32,
                boxShadow: active
                  ? `0 0 0 2px ${C.white}, 0 0 0 3.5px ${color}`
                  : "none",
              }}
            />

            <span
              style={{
                fontFamily: FONT_HEAD,
                fontWeight: active ? 800 : 600,
                fontSize: 10,
                color: active ? color : "rgba(26,18,9,0.4)",
              }}
            >
              {g.toUpperCase()}
            </span>
          </div>
        )
      })}
    </div>
  )
}

type CompareVerdict = "safe" | "caution" | "avoid" | null

type CompareProduct = {
  name: string
  brand?: string
  quantity?: string
  imageUrl?: string
  // Nutrition grade (A–E) — quality only, never affected by this user's
  // saved allergies. See `verdict` for the personalized safety check.
  grade: NutritionGrade | null
  verdict: CompareVerdict
  verdictReason?: string
  allergens?: string[]
  ingredientsText?: string
  nutrition?: {
    energyKcal100g?: number
    sugars100g?: number
    fat100g?: number
    saturatedFat100g?: number
    carbohydrates100g?: number
    proteins100g?: number
    sodium100g?: number
    fiber100g?: number
  }
  breakdown?: {
    ingredient: number
    nutrition: number
    processing: number
  } | null
}

const COMPARE_PRODUCT_A: CompareProduct = {
  name: "Noodles Beef",
  brand: "Golden Wok",
  quantity: "85g pack",
  imageUrl: beefNoodlesImg,
  grade: "a",
  verdict: "avoid",
  verdictReason:
    "Flagged against your saved allergy profile — see allergens detected below.",
  allergens: ["wheat", "soy"],
  ingredientsText:
    "Wheat flour, palm oil, salt, beef flavoring (contains soy), sodium benzoate, maltodextrin, monosodium glutamate, dried vegetables (cabbage, carrot, scallion), spices, sugar, caramel color, disodium inosinate, disodium guanylate.",
  nutrition: {
    energyKcal100g: 436,
    sugars100g: 4,
    fat100g: 17,
    saturatedFat100g: 8,
    carbohydrates100g: 61,
    proteins100g: 9,
    sodium100g: 0.84,
    fiber100g: 2,
  },
  breakdown: {
    ingredient: 54,
    nutrition: 48,
    processing: 40,
  },
}

const COMPARE_PRODUCT_B: CompareProduct = {
  name: "Noodles Chicken",
  brand: "Golden Wok",
  quantity: "85g pack",
  imageUrl: chickenNoodlesImg,
  grade: "b",
  verdict: "safe",
  verdictReason:
    "No allergens or ingredients flagged against your saved profile.",
  allergens: [],
  ingredientsText:
    "Wheat flour, palm oil, salt, chicken flavoring, dried vegetables (carrot, scallion, corn), spices, sugar, turmeric, disodium inosinate, disodium guanylate.",
  nutrition: {
    energyKcal100g: 410,
    sugars100g: 1,
    fat100g: 14,
    saturatedFat100g: 6,
    carbohydrates100g: 58,
    proteins100g: 10,
    sodium100g: 0.41,
    fiber100g: 3,
  },
  breakdown: {
    ingredient: 66,
    nutrition: 61,
    processing: 55,
  },
}

// ── Status Glyphs ────────────────────────────────────────────────────────────

function StatusGlyph({
  status,
  size = 15,
}: {
  status: "safe" | "caution" | "avoid"
  size?: number
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: C.white,
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  }

  if (status === "safe") {
    return (
      <svg {...common}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )
  }

  if (status === "caution") {
    return (
      <svg {...common}>
        <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
        <line x1="12" y1="9.5" x2="12" y2="13.5" />
        <circle
          cx="12"
          cy="16.7"
          r="0.9"
          fill={C.white}
          stroke="none"
        />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  )
}

const STATUS_META: Record<
  "safe" | "caution" | "avoid",
  {
    label: string
    text: string
    bg: string
    border: string
    fill: string
  }
> = {
  safe: {
    label: "Safe",
    text: C.greenMid,
    bg: "rgba(76,175,80,0.14)",
    border: "rgba(76,175,80,0.45)",
    fill: C.statusSafe,
  },

  caution: {
    label: "Caution",
    text: "#8A6300",
    bg: "rgba(245,197,24,0.18)",
    border: "rgba(245,197,24,0.55)",
    fill: C.statusCaution,
  },

  avoid: {
    label: "Avoid",
    text: "#B3261E",
    bg: "rgba(232,69,60,0.12)",
    border: "rgba(232,69,60,0.4)",
    fill: C.statusDanger,
  },
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({
  verdict,
  reason,
  size = "md",
}: {
  verdict: CompareVerdict
  reason?: string
  size?: "md" | "lg"
}) {
  const isDesktop = useIsDesktop()
  const big = size === "lg"

  const dot = big
    ? isDesktop
      ? 36
      : 26
    : 22

  if (!verdict) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: isDesktop ? 12 : 8,
          padding: big
            ? isDesktop
              ? "13px 15px"
              : "10px 10px"
            : "9px 12px",
          borderRadius: C.radiusMd ?? 14,
          background: "rgba(26,18,9,0.05)",
          border: "1.5px dashed rgba(26,18,9,0.26)",
        }}
      >
        <div
          style={{
            width: dot,
            height: dot,
            borderRadius: C.radiusFull ?? "50%",
            background: "rgba(26,18,9,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              color: "rgba(26,18,9,0.55)",
              fontFamily: FONT_HEAD,
              fontWeight: 800,
              fontSize: big
                ? isDesktop
                  ? 15
                  : 12.5
                : 12.5,
            }}
          >
            ?
          </span>
        </div>

        <div>
          <p
            style={{
              margin: 0,
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: big
                ? isDesktop
                  ? 14.5
                  : 12.5
                : 12.5,
              color: "rgba(26,18,9,0.78)",
            }}
          >
            Verdict unavailable
          </p>

          <p
            style={{
              margin: "2px 0 0",
              fontFamily: FONT_BODY,
              fontSize: big
                ? isDesktop
                  ? 12
                  : 10.5
                : 11,
              lineHeight: 1.5,
              color: "rgba(26,18,9,0.52)",
            }}
          >
            Not enough data to determine a verdict.
          </p>
        </div>
      </div>
    )
  }

  const meta = STATUS_META[verdict]

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: isDesktop ? 12 : 8,
        padding: big
          ? isDesktop
            ? "13px 15px"
            : "10px 10px"
          : "9px 12px",
        borderRadius: 14,
        background: meta.bg,
        border: `1.5px solid ${meta.border}`,
      }}
    >
      <div
        style={{
          width: dot,
          height: dot,
          borderRadius: "50%",
          background: meta.fill,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: `0 0 0 3px ${meta.bg}`,
        }}
      >
        <StatusGlyph
          status={verdict}
          size={
            big
              ? isDesktop
                ? 18
                : 14
              : 14
          }
        />
      </div>

      <div style={{ minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: FONT_HEAD,
            fontWeight: 800,
            fontSize: big
              ? isDesktop
                ? 15
                : 13
              : 13,
            letterSpacing: "0.01em",
            color: meta.text,
          }}
        >
          {meta.label}
        </p>

        {reason && (
          <p
            style={{
              margin: "3px 0 0",
              fontFamily: FONT_BODY,
              fontSize: big
                ? isDesktop
                  ? 12
                  : 10.5
                : 11,
              lineHeight: 1.5,
              color: "rgba(26,18,9,0.72)",
            }}
          >
            {reason}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Allergen List ────────────────────────────────────────────────────────────

function AllergenList({
  allergens,
}: {
  allergens?: string[]
}) {
  if (allergens === undefined) {
    return (
      <span
        style={{
          display: "inline-block",
          padding: "6px 11px",
          borderRadius: 10,
          fontFamily: FONT_BODY,
          fontSize: 11,
          fontWeight: 600,
          fontStyle: "italic",
          background: "transparent",
          border: "1px dashed rgba(26,18,9,0.28)",
          color: "rgba(26,18,9,0.5)",
        }}
      >
        Allergen data unavailable
      </span>
    )
  }

  if (allergens.length === 0) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 12px",
          borderRadius: 10,
          background: "rgba(76,175,80,0.14)",
          border: "1px solid rgba(76,175,80,0.45)",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke={C.greenMid}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>

        <span
          style={{
            fontFamily: FONT_BODY,
            fontSize: 11.5,
            fontWeight: 700,
            color: C.greenMid,
          }}
        >
          No allergens detected
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 7,
      }}
    >
      {allergens.map((allergen) => (
        <span
          key={allergen}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 11px",
            borderRadius: 10,
            fontFamily: FONT_BODY,
            fontSize: 11.5,
            fontWeight: 700,
            background: "rgba(232,69,60,0.12)",
            border: "1px solid rgba(232,69,60,0.4)",
            color: C.statusDanger,
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.statusDanger}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
            <line
              x1="12"
              y1="9.5"
              x2="12"
              y2="13.5"
            />
          </svg>

          Contains{" "}
          {allergen.charAt(0).toUpperCase() +
            allergen.slice(1)}
        </span>
      ))}
    </div>
  )
}

// ── Ingredient Helpers ──────────────────────────────────────────────────────

function splitIngredients(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""

  for (const ch of text) {
    if (ch === "(") depth++
    if (ch === ")") depth = Math.max(0, depth - 1)

    if (ch === "," && depth === 0) {
      parts.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }

  if (current.trim()) {
    parts.push(current.trim())
  }

  return parts
    .map((p) => p.replace(/\.\s*$/, ""))
    .filter(Boolean)
}

function flagForIngredient(
  fragment: string,
  allergens: string[] = []
): string | null {
  const lower = fragment.toLowerCase()

  const hit = allergens.find((allergen) =>
    lower.includes(allergen.toLowerCase())
  )

  return hit
    ? hit.charAt(0).toUpperCase() + hit.slice(1)
    : null
}

// ── Ingredient Breakdown ────────────────────────────────────────────────────

function IngredientBreakdown({
  product,
}: {
  product: CompareProduct
}) {
  const [expanded, setExpanded] = useState(false)

  if (product.ingredientsText === undefined) {
    return (
      <p
        style={{
          fontFamily: FONT_BODY,
          fontSize: 11.5,
          color: "rgba(26,18,9,0.5)",
          fontStyle: "italic",
          margin: 0,
        }}
      >
        Ingredient information not provided for this product
      </p>
    )
  }

  const items = splitIngredients(product.ingredientsText)

  const flagged = items.filter((item) =>
    flagForIngredient(item, product.allergens)
  )

  const visible = expanded
    ? items
    : items.slice(0, 6)

  const hiddenCount = items.length - visible.length

  return (
    <div>
      {flagged.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 10,
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.statusDanger}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
            <line
              x1="12"
              y1="9"
              x2="12"
              y2="13"
            />
          </svg>

          <span
            style={{
              fontFamily: FONT_BODY,
              fontSize: 11,
              fontWeight: 700,
              color: C.statusDanger,
            }}
          >
            {flagged.length} ingredient
            {flagged.length > 1 ? "s" : ""} linked to a flagged
            allergen
          </span>
        </div>
      )}

      <div
        style={{
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(26,18,9,0.10)",
        }}
      >
        {visible.map((item, index) => {
          const flag = flagForIngredient(
            item,
            product.allergens
          )

          return (
            <div
              key={`${item}-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "9px 12px",
                background: flag
                  ? "rgba(232,69,60,0.10)"
                  : index % 2 === 0
                    ? "rgba(26,18,9,0.03)"
                    : "transparent",
                borderLeft: flag
                  ? `3px solid ${C.statusDanger}`
                  : "3px solid transparent",
                borderTop:
                  index === 0
                    ? "none"
                    : "1px solid rgba(26,18,9,0.07)",
              }}
            >
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 12.5,
                  lineHeight: 1.4,
                  color: flag
                    ? C.statusDanger
                    : "rgba(26,18,9,0.8)",
                  textTransform: "capitalize",
                }}
              >
                {item}
              </span>

              {flag && (
                <span
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 9px",
                    borderRadius: 999,
                    background: "rgba(232,69,60,0.16)",
                    fontFamily: FONT_HEAD,
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: C.statusDanger,
                    whiteSpace: "nowrap",
                  }}
                >
                  {flag}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {items.length > 6 && (
        <button
          type="button"
          onClick={() =>
            setExpanded((value) => !value)
          }
          style={{
            marginTop: 9,
            background: "none",
            border: "none",
            color: C.greenMid,
            fontFamily: FONT_HEAD,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {expanded
            ? "Show less"
            : `Show ${hiddenCount} more ingredients`}
        </button>
      )}
    </div>
  )
}

// ── Nutrition Table ─────────────────────────────────────────────────────────

const NUTRITION_ROWS: {
  key: keyof NonNullable<CompareProduct["nutrition"]>
  label: string
  unit: string
}[] = [
  {
    key: "energyKcal100g",
    label: "Energy",
    unit: " kcal",
  },
  {
    key: "sugars100g",
    label: "Sugars",
    unit: " g",
  },
  {
    key: "fat100g",
    label: "Fat",
    unit: " g",
  },
  {
    key: "saturatedFat100g",
    label: "Saturated fat",
    unit: " g",
  },
  {
    key: "carbohydrates100g",
    label: "Carbohydrates",
    unit: " g",
  },
  {
    key: "proteins100g",
    label: "Protein",
    unit: " g",
  },
  {
    key: "sodium100g",
    label: "Sodium",
    unit: " g",
  },
  {
    key: "fiber100g",
    label: "Fiber",
    unit: " g",
  },
]

function NutritionTable({
  a,
  b,
}: {
  a: CompareProduct
  b: CompareProduct
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        background: C.white,
        border: `1.5px solid ${C.border}`,
        padding: 20,
        marginTop: 20,
        boxShadow: cardShadow,
      }}
    >
      <p
        style={{
          margin: "0 0 14px",
          fontFamily: FONT_HEAD,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "rgba(26,18,9,0.62)",
        }}
      >
        Nutrition Comparison — per 100g
      </p>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
          }}
        >
          <thead>
            <tr>
              <th />

              <th
                style={{
                  textAlign: "right",
                  fontFamily: FONT_HEAD,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: "rgba(26,18,9,0.65)",
                  paddingBottom: 10,
                }}
              >
                {a.name}
              </th>

              <th
                style={{
                  textAlign: "right",
                  fontFamily: FONT_HEAD,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: "rgba(26,18,9,0.65)",
                  paddingBottom: 10,
                }}
              >
                {b.name}
              </th>
            </tr>
          </thead>

          <tbody>
            {NUTRITION_ROWS.map((row) => {
              const av = a.nutrition?.[row.key]
              const bv = b.nutrition?.[row.key]

              return (
                <tr key={row.key}>
                  <td
                    style={{
                      padding: "10px 10px 10px 0",
                      borderTop:
                        "1px solid rgba(26,18,9,0.08)",
                      fontFamily: FONT_BODY,
                      fontSize: 12.5,
                      color: "rgba(26,18,9,0.75)",
                    }}
                  >
                    {row.label}
                  </td>

                  <td
                    style={{
                      padding: "10px",
                      borderTop:
                        "1px solid rgba(26,18,9,0.08)",
                      textAlign: "right",
                      fontFamily: FONT_BODY,
                      fontSize: 13,
                      fontVariantNumeric: "tabular-nums",
                      fontWeight:
                        av === undefined ? 400 : 700,
                      color:
                        av === undefined
                          ? "rgba(26,18,9,0.45)"
                          : C.black,
                      fontStyle:
                        av === undefined
                          ? "italic"
                          : "normal",
                    }}
                  >
                    {av === undefined
                      ? "—"
                      : `${av}${row.unit}`}
                  </td>

                  <td
                    style={{
                      padding: "10px",
                      borderTop:
                        "1px solid rgba(26,18,9,0.08)",
                      textAlign: "right",
                      fontFamily: FONT_BODY,
                      fontSize: 13,
                      fontVariantNumeric: "tabular-nums",
                      fontWeight:
                        bv === undefined ? 400 : 700,
                      color:
                        bv === undefined
                          ? "rgba(26,18,9,0.45)"
                          : C.black,
                      fontStyle:
                        bv === undefined
                          ? "italic"
                          : "normal",
                    }}
                  >
                    {bv === undefined
                      ? "—"
                      : `${bv}${row.unit}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Shared Comparison Components ────────────────────────────────────────────

function CmpLabel({
  children,
}: {
  children: ReactNode
}) {
  return (
    <p
      style={{
        margin: "0 0 10px",
        fontFamily: FONT_HEAD,
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: "rgba(26,18,9,0.5)",
      }}
    >
      {children}
    </p>
  )
}

function CmpCard({
  children,
  accent = false,
}: {
  children: ReactNode
  accent?: boolean
}) {
  const isDesktop = useIsDesktop()

  return (
    <div
      style={{
        borderRadius: 18,
        padding: isDesktop ? 20 : 13,
        display: "flex",
        flexDirection: "column",
        gap: isDesktop ? 16 : 11,
        background: C.white,
        border: `1.5px solid ${
          accent ? C.green : C.border
        }`,
        boxShadow: accent
          ? `0 0 0 1px ${C.green} inset, ${cardShadow}`
          : cardShadow,
      }}
    >
      {children}
    </div>
  )
}

// ── Product Image ───────────────────────────────────────────────────────────

function ProductImage({
  imageUrl,
  name,
}: {
  imageUrl?: string
  name: string
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/10",
        borderRadius: 14,
        overflow: "hidden",
        background: C.grayLight,
        border: `1.5px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke={C.gray}
          strokeWidth="1.5"
        >
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="2"
          />
          <circle
            cx="8.5"
            cy="8.5"
            r="1.5"
          />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      )}
    </div>
  )
}

// ── Product Header Card ─────────────────────────────────────────────────────

function ProductHeaderCard({
  label,
  product,
  isWinner,
}: {
  label: "A" | "B"
  product: CompareProduct
  isWinner?: boolean
}) {
  const isDesktop = useIsDesktop()

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 18,
        padding: isDesktop ? 20 : 13,
        display: "flex",
        flexDirection: "column",
        gap: isDesktop ? 14 : 9,
        background: C.white,
        border: `1.5px solid ${
          isWinner ? C.green : C.border
        }`,
        boxShadow: isWinner
          ? `0 0 0 1px ${C.green} inset, 0 8px 20px rgba(45,106,79,0.18)`
          : cardShadow,
      }}
    >
      {isWinner && (
        <div
          style={{
            position: "absolute",
            top: isDesktop ? -12 : -10,
            left: isDesktop ? 20 : 13,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: isDesktop
              ? "5px 12px"
              : "3px 9px",
            borderRadius: 999,
            background: `linear-gradient(135deg, ${C.greenLight}, ${C.goldDark})`,
            boxShadow:
              "0 3px 10px rgba(224,167,46,0.4)",
          }}
        >
          <svg
            width={isDesktop ? 11 : 9}
            height={isDesktop ? 11 : 9}
            viewBox="0 0 24 24"
            fill={C.mochaDark}
            stroke="none"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>

          <span
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 800,
              fontSize: isDesktop ? 10 : 8.5,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: C.mochaDark,
            }}
          >
            Best choice
          </span>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: isDesktop ? 8 : 6,
          marginTop: isDesktop ? 0 : 4,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: isDesktop ? 22 : 18,
            height: isDesktop ? 22 : 18,
            borderRadius: "50%",
            background: C.green,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONT_HEAD,
            fontWeight: 800,
            fontSize: isDesktop ? 11 : 9.5,
            color: C.white,
            flexShrink: 0,
          }}
        >
          {label}
        </span>

        <span
          style={{
            fontFamily: FONT_HEAD,
            fontSize: isDesktop ? 10 : 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(26,18,9,0.55)",
          }}
        >
          Product {label}
        </span>
      </div>

      <ProductImage
        imageUrl={product.imageUrl}
        name={product.name}
      />

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: isDesktop ? 12 : 6,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: isDesktop ? 17 : 13,
              lineHeight: 1.25,
              color: C.black,
            }}
          >
            {product.name}
          </p>

          <p
            style={{
              margin: "5px 0 0",
              fontFamily: FONT_BODY,
              fontSize: isDesktop ? 12 : 10,
              color: "rgba(26,18,9,0.58)",
            }}
          >
            {[
              product.brand,
              product.quantity,
            ]
              .filter(Boolean)
              .join(" · ") ||
              "Brand/size unavailable"}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            flexShrink: 0,
          }}
        >
          <GradeBadge
            grade={product.grade}
            size={isDesktop ? 58 : 42}
          />

          <span
            style={{
              fontFamily: FONT_BODY,
              fontSize: isDesktop ? 9 : 7.5,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "rgba(26,18,9,0.42)",
            }}
          >
            grade
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Comparison Section ──────────────────────────────────────────────────────

function CmpSection({
  title,
  description,
  first = false,
  children,
}: {
  title: string
  description?: string
  first?: boolean
  children: ReactNode
}) {
  return (
    <section
      style={{
        marginTop: first ? 0 : 40,
        paddingTop: first ? 0 : 32,
        borderTop: first
          ? "none"
          : "1px solid rgba(26,18,9,0.08)",
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: FONT_HEAD,
            fontWeight: 800,
            fontSize: 17,
            color: C.black,
          }}
        >
          {title}
        </h2>

        {description && (
          <p
            style={{
              margin: "5px 0 0",
              fontFamily: FONT_BODY,
              fontSize: 12.5,
              lineHeight: 1.55,
              color: "rgba(26,18,9,0.6)",
            }}
          >
            {description}
          </p>
        )}
      </div>

      {children}
    </section>
  )
}

function cmpGrid(isDesktop: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: isDesktop
      ? "repeat(auto-fit, minmax(260px, 1fr))"
      : "1fr 1fr",
    gap: isDesktop ? 22 : 10,
  }
}

// ── Key Insights ─────────────────────────────────────────────────────────────

function buildInsights(
  a: CompareProduct,
  b: CompareProduct,
  recommendation: "a" | "b" | "none"
): string[] {
  const insights: string[] = []

  if (
    a.grade !== null &&
    b.grade !== null &&
    recommendation !== "none"
  ) {
    const winner =
      recommendation === "a" ? a : b

    const loser =
      recommendation === "a" ? b : a

    if (winner.grade !== loser.grade) {
      insights.push(
        `${winner.name} has a better nutrition grade (${winner.grade!.toUpperCase()}) than ${loser.name} (${loser.grade!.toUpperCase()}).`
      )
    }
  }

  const compareNutrient = (
    key: keyof NonNullable<
      CompareProduct["nutrition"]
    >,
    label: string,
    unit: string
  ) => {
    if (insights.length >= 3) return

    const av = a.nutrition?.[key]
    const bv = b.nutrition?.[key]

    if (
      av === undefined ||
      bv === undefined ||
      av === bv
    ) {
      return
    }

    const higher = av > bv ? a : b
    const lower = av > bv ? b : a
    const diff = Math.abs(av - bv)

    insights.push(
      `${higher.name} has ${Number(
        diff.toFixed(2)
      )}${unit} more ${label.toLowerCase()} per 100g than ${lower.name}.`
    )
  }

  compareNutrient(
    "sodium100g",
    "Sodium",
    "g"
  )

  compareNutrient(
    "sugars100g",
    "Sugar",
    "g"
  )

  if (
    insights.length < 3 &&
    a.allergens !== undefined &&
    b.allergens !== undefined
  ) {
    const aHas = a.allergens.length > 0
    const bHas = b.allergens.length > 0

    if (!aHas && !bHas) {
      insights.push(
        "Neither product has flagged allergens against your saved profile."
      )
    } else if (aHas !== bHas) {
      const clear = aHas ? b : a
      const flagged = aHas ? a : b

      insights.push(
        `${clear.name} has no flagged allergens, while ${flagged.name} contains ${flagged.allergens!.join(", ")}.`
      )
    }
  }

  return insights.slice(0, 3)
}

// ── Key Insights Card ───────────────────────────────────────────────────────

function KeyInsightsCard({
  a,
  b,
  recommendation,
}: {
  a: CompareProduct
  b: CompareProduct
  recommendation: "a" | "b" | "none"
}) {
  const insights = buildInsights(
    a,
    b,
    recommendation
  )

  const winner =
    recommendation === "a"
      ? a
      : recommendation === "b"
        ? b
        : null

  return (
    <div
      style={{
        borderRadius: 18,
        padding: 22,
        background: C.white,
        border: `1.5px solid ${
          recommendation === "none"
            ? "rgba(26,18,9,0.16)"
            : C.green
        }`,
        boxShadow: cardShadow,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              recommendation === "none"
                ? "rgba(26,18,9,0.08)"
                : `linear-gradient(135deg, ${C.green}, ${C.greenMid})`,
          }}
        >
          {recommendation === "none" ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(26,18,9,0.65)"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line
                x1="7"
                y1="12"
                x2="17"
                y2="12"
              />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.white}
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>

        <div>
          <p
            style={{
              margin: 0,
              fontFamily: FONT_HEAD,
              fontWeight: 800,
              fontSize: 16,
              color: C.black,
            }}
          >
            {recommendation === "none" ? (
              "No clear recommendation"
            ) : (
              <>
                <span style={{ color: C.greenMid }}>
                  {winner!.name}
                </span>{" "}
                is the better choice
              </>
            )}
          </p>

          <p
            style={{
              margin: "4px 0 0",
              fontFamily: FONT_BODY,
              fontSize: 12.5,
              lineHeight: 1.55,
              color: "rgba(26,18,9,0.65)",
            }}
          >
            {recommendation === "none"
              ? "Both products score too closely, or key data is missing, for Scanity to call a clear winner. Use the breakdown above to decide what matters most to you."
              : "Based on nutrition grade, ingredient quality, and your saved health profile."}
          </p>
        </div>
      </div>

      {insights.length > 0 && (
        <p
          style={{
            margin: 0,
            fontFamily: FONT_BODY,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "rgba(26,18,9,0.78)",
          }}
        >
          {insights.join(" ")}
        </p>
      )}
    </div>
  )
}

// ── Empty / Loading / Error Panel ───────────────────────────────────────────

function ComparePanel({
  children,
  dashed = false,
}: {
  children: ReactNode
  dashed?: boolean
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        background: C.white,
        border: dashed
          ? `1.5px dashed ${C.border}`
          : `1.5px solid ${C.border}`,
        boxShadow: cardShadow,
        padding: "40px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 12,
      }}
    >
      {children}
    </div>
  )
}
// ── Product Compare Screen — Soft Slate Neumorphic ────────────────────────────

type CompareScenario =
  | "initial"
  | "loading"
  | "success-a"
  | "success-b"
  | "success-none"
  | "incomplete"
  | "not-found"
  | "error"

function ProductCompareScreen({
  go,
  goBack,
}: {
  go: (s: Screen) => void
  goBack: () => void
}) {
  const isDesktop = useIsDesktop()
  const [scenario, setScenario] =
    useState<CompareScenario>("success-a")

  const [navOpen, setNavOpen] = useState(false)

  const H_PAD = isDesktop ? 40 : 20

  // ── Neumorphic styles ─────────────────────────────────────────────────────

  const raisedCard: CSSProperties = {
    background: SOFT_SLATE.bg,
    border: "none",
    borderRadius: 24,
    boxShadow: SOFT_SLATE.raisedMd,
  }

  const smallRaised: CSSProperties = {
    background: SOFT_SLATE.bg,
    border: "none",
    borderRadius: 18,
    boxShadow: SOFT_SLATE.raisedSm,
  }

  const insetCard: CSSProperties = {
    background: SOFT_SLATE.bg,
    border: "none",
    borderRadius: 18,
    boxShadow: SOFT_SLATE.insetMd,
  }

  // ── Comparison runner ─────────────────────────────────────────────────────

  const runComparison = (
    outcome: "success" | "error"
  ) => {
    setScenario("loading")

    window.setTimeout(() => {
      setScenario(
        outcome === "success"
          ? "success-a"
          : "error"
      )
    }, 900)
  }

  // ── Product data ──────────────────────────────────────────────────────────

  let a: CompareProduct = COMPARE_PRODUCT_A
  let b: CompareProduct = COMPARE_PRODUCT_B

  if (scenario === "success-none") {
    a = {
      ...a,
      grade: "c",
      verdict: "caution",
    }

    b = {
      ...b,
      grade: "c",
      verdict: "caution",
    }
  }

  if (scenario === "incomplete") {
    b = {
      ...b,
      ingredientsText: undefined,
      allergens: undefined,
      breakdown: null,
      grade: null,
      verdict: null,
      verdictReason: undefined,
    }
  }

  // ── Recommendation ────────────────────────────────────────────────────────

  const recommendation:
    | "a"
    | "b"
    | "none" = (() => {
    if (
      a.grade === null ||
      b.grade === null
    ) {
      return "none"
    }

    if (
      a.verdict === "avoid" &&
      b.verdict !== "avoid"
    ) {
      return "b"
    }

    if (
      b.verdict === "avoid" &&
      a.verdict !== "avoid"
    ) {
      return "a"
    }

    const aRank = GRADE_ORDER.indexOf(a.grade)
    const bRank = GRADE_ORDER.indexOf(b.grade)

    if (aRank === bRank) {
      return "none"
    }

    return aRank < bRank ? "a" : "b"
  })()

  // ── Product card ──────────────────────────────────────────────────────────

  const ProductCard = ({
    label,
    product,
    winner,
  }: {
    label: "A" | "B"
    product: CompareProduct
    winner: boolean
  }) => {
    return (
      <div
        style={{
          ...raisedCard,
          position: "relative",
          padding: isDesktop ? 22 : 15,
          display: "flex",
          flexDirection: "column",
          gap: isDesktop ? 15 : 11,
          boxSizing: "border-box",
          minWidth: 0,

          boxShadow: winner
            ? `
              0 0 0 2px ${SOFT_SLATE.green},
              ${SOFT_SLATE.raisedMd}
            `
            : SOFT_SLATE.raisedMd,
        }}
      >
        {/* Best choice badge */}
        {winner && (
          <div
            style={{
              position: "absolute",
              top: isDesktop ? -12 : -9,
              left: isDesktop ? 20 : 13,

              display: "inline-flex",
              alignItems: "center",
              gap: 5,

              padding: isDesktop
                ? "5px 12px"
                : "4px 9px",

              borderRadius: 999,

              background: SOFT_SLATE.bg,
              boxShadow: SOFT_SLATE.raisedSm,

              fontFamily: SOFT_SLATE.fontFamily,
              fontWeight: 800,
              fontSize: isDesktop ? 9.5 : 8,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: SOFT_SLATE.green,

              zIndex: 2,
            }}
          >
            <span
              style={{
                fontSize: isDesktop ? 12 : 10,
              }}
            >
              ★
            </span>

            Best choice
          </div>
        )}

        {/* Product label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: isDesktop ? 30 : 25,
              height: isDesktop ? 30 : 25,
              borderRadius: "50%",

              background: SOFT_SLATE.bg,

              display: "flex",
              alignItems: "center",
              justifyContent: "center",

              boxShadow: SOFT_SLATE.insetSm,

              fontFamily: SOFT_SLATE.fontFamily,
              fontWeight: 800,
              fontSize: isDesktop ? 11 : 9,
              color: SOFT_SLATE.green,

              flexShrink: 0,
            }}
          >
            {label}
          </span>

          <span
            style={{
              fontFamily: SOFT_SLATE.fontFamily,
              fontSize: isDesktop ? 10 : 9,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: SOFT_SLATE.textMuted,
            }}
          >
            Product {label}
          </span>
        </div>

        {/* Image well */}
        <div
          style={{
            width: "100%",
            aspectRatio: "16/10",
            borderRadius: 20,

            background: SOFT_SLATE.thumbBg,

            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            boxShadow: SOFT_SLATE.insetMd,

            overflow: "hidden",
          }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                padding: isDesktop ? 15 : 10,
                boxSizing: "border-box",
              }}
            />
          ) : (
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke={SOFT_SLATE.textMuted}
              strokeWidth="1.5"
            >
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="2"
              />
              <circle
                cx="8.5"
                cy="8.5"
                r="1.5"
              />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          )}
        </div>

        {/* Product information */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div
            style={{
              minWidth: 0,
              flex: 1,
            }}
          >
            <p
              style={{
                margin: 0,

                fontFamily: SOFT_SLATE.fontFamily,
                fontWeight: 800,
                fontSize: isDesktop ? 17 : 13,
                lineHeight: 1.25,

                color: SOFT_SLATE.textPrimary,

                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {product.name}
            </p>

            <p
              style={{
                margin: "5px 0 0",

                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: isDesktop ? 11.5 : 9.5,

                color: SOFT_SLATE.textSecondary,
              }}
            >
              {[
                product.brand,
                product.quantity,
              ]
                .filter(Boolean)
                .join(" · ") ||
                "Brand/size unavailable"}
            </p>
          </div>

          {/* Grade */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                borderRadius: "50%",
                padding: 3,
                background: SOFT_SLATE.bg,
                boxShadow: SOFT_SLATE.raisedSm,
              }}
            >
              <GradeBadge
                grade={product.grade}
                size={isDesktop ? 54 : 42}
              />
            </div>

            <span
              style={{
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: isDesktop ? 8.5 : 7,
                fontWeight: 800,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: SOFT_SLATE.textMuted,
              }}
            >
              Grade
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ── Neumorphic comparison card ───────────────────────────────────────────

  const CompareCard = ({
    children,
    accent = false,
  }: {
    children: ReactNode
    accent?: boolean
  }) => (
    <div
      style={{
        ...raisedCard,

        padding: isDesktop ? 20 : 14,

        display: "flex",
        flexDirection: "column",
        gap: isDesktop ? 16 : 11,

        boxShadow: accent
          ? `
            0 0 0 2px ${SOFT_SLATE.green},
            ${SOFT_SLATE.raisedMd}
          `
          : SOFT_SLATE.raisedMd,

        boxSizing: "border-box",
        minWidth: 0,
      }}
    >
      {children}
    </div>
  )

  // ── Section ───────────────────────────────────────────────────────────────

  const Section = ({
    title,
    description,
    children,
  }: {
    title: string
    description?: string
    children: ReactNode
  }) => (
    <section
      style={{
        marginTop: 30,
      }}
    >
      <div
        style={{
          marginBottom: 16,
          paddingLeft: 4,
        }}
      >
        <h2
          style={{
            margin: 0,

            fontFamily: SOFT_SLATE.fontFamily,
            fontWeight: 800,
            fontSize: isDesktop ? 18 : 16,

            color: SOFT_SLATE.textPrimary,

            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>

        {description && (
          <p
            style={{
              margin: "5px 0 0",

              fontFamily: SOFT_SLATE.fontFamily,
              fontSize: 12,
              lineHeight: 1.55,

              color: SOFT_SLATE.textSecondary,
            }}
          >
            {description}
          </p>
        )}
      </div>

      {children}
    </section>
  )

  // ── Loading ───────────────────────────────────────────────────────────────

  if (scenario === "loading") {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",

          background: SOFT_SLATE.bg,

          overflow: "hidden",
          position: "relative",

          fontFamily: SOFT_SLATE.fontFamily,
        }}
      >
        <DashboardIconRail
          go={go}
          isDesktop={isDesktop}
          active="productCompare"
          navItems={[
            {
              screen: "dashboard",
              label: "Dashboard",
              path: null,
            },
            {
              screen: "productCompare",
              label: "Compare Products",
              path: null,
            },
            {
              screen: "settings",
              label: "Settings",
              path: null,
            },
            {
              screen: "help",
              label: "Help & FAQ",
              path: null,
            },
            {
              screen: "about",
              label: "About",
              path: null,
            },
          ]}
        />

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",

            marginLeft: isDesktop ? 80 : 0,
          }}
        >
          {!isDesktop && (
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              style={{
                position: "fixed",
                top: `calc(${SAFE_TOP} + 14px)`,
                left: 14,
                zIndex: 50,

                width: 42,
                height: 42,

                border: "none",
                borderRadius: 14,

                background: SOFT_SLATE.bg,
                color: SOFT_SLATE.green,

                boxShadow: SOFT_SLATE.raisedSm,

                cursor: "pointer",
              }}
            >
              ☰
            </button>
          )}

          <div
            style={{
              padding: `${
                isDesktop
                  ? "40px"
                  : `calc(${SAFE_TOP} + 66px)`
              } ${H_PAD}px 10px`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <BackBtn onPress={goBack} />

              <h1
                style={{
                  margin: 0,
                  fontFamily: SOFT_SLATE.fontFamily,
                  fontWeight: 800,
                  fontSize: 23,
                  color: SOFT_SLATE.textPrimary,
                }}
              >
                Compare Products
              </h1>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: `10px ${H_PAD}px 50px`,
            }}
          >
            <Center maxWidth={1080}>
              <div
                style={{
                  ...raisedCard,
                  padding: 40,

                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",

                  textAlign: "center",
                  gap: 15,
                }}
              >
                <div
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: "50%",

                    background: SOFT_SLATE.bg,

                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",

                    boxShadow: SOFT_SLATE.insetMd,

                    color: SOFT_SLATE.green,

                    fontSize: 25,
                  }}
                >
                  ⟳
                </div>

                <h3
                  style={{
                    margin: 0,
                    fontFamily: SOFT_SLATE.fontFamily,
                    fontSize: 16,
                    fontWeight: 800,
                    color: SOFT_SLATE.textPrimary,
                  }}
                >
                  Comparing products
                </h3>

                <p
                  style={{
                    margin: 0,
                    fontFamily: SOFT_SLATE.fontFamily,
                    fontSize: 12.5,
                    color: SOFT_SLATE.textSecondary,
                  }}
                >
                  Checking nutrition, ingredients, and allergy safety...
                </p>
              </div>
            </Center>
          </div>
        </div>
      </div>
    )
  }

  // ── Error / Not Found ────────────────────────────────────────────────────

  if (
    scenario === "error" ||
    scenario === "not-found"
  ) {
    const isError = scenario === "error"

    return (
      <div
        style={{
          flex: 1,
          display: "flex",

          background: SOFT_SLATE.bg,

          overflow: "hidden",
          position: "relative",

          fontFamily: SOFT_SLATE.fontFamily,
        }}
      >
        <DashboardIconRail
          go={go}
          isDesktop={isDesktop}
          active="productCompare"
          navItems={[
            {
              screen: "dashboard",
              label: "Dashboard",
              path: null,
            },
            {
              screen: "productCompare",
              label: "Compare Products",
              path: null,
            },
            {
              screen: "settings",
              label: "Settings",
              path: null,
            },
            {
              screen: "help",
              label: "Help & FAQ",
              path: null,
            },
            {
              screen: "about",
              label: "About",
              path: null,
            },
          ]}
        />

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            marginLeft: isDesktop ? 80 : 0,
          }}
        >
          <div
            style={{
              padding: `${
                isDesktop
                  ? "40px"
                  : `calc(${SAFE_TOP} + 66px)`
              } ${H_PAD}px 10px`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <BackBtn onPress={goBack} />

              <h1
                style={{
                  margin: 0,
                  fontFamily: SOFT_SLATE.fontFamily,
                  fontWeight: 800,
                  fontSize: 23,
                  color: SOFT_SLATE.textPrimary,
                }}
              >
                Compare Products
              </h1>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: `20px ${H_PAD}px 50px`,
            }}
          >
            <Center maxWidth={700}>
              <div
                style={{
                  ...raisedCard,

                  padding: isDesktop ? 48 : 30,

                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: "50%",

                    background: SOFT_SLATE.bg,

                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",

                    boxShadow: SOFT_SLATE.insetMd,

                    color: isError
                      ? SOFT_SLATE.unsafe
                      : SOFT_SLATE.caution,

                    fontSize: 27,
                    fontWeight: 800,
                  }}
                >
                  {isError ? "!" : "?"}
                </div>

                <h3
                  style={{
                    margin: 0,
                    fontFamily: SOFT_SLATE.fontFamily,
                    fontSize: 17,
                    fontWeight: 800,
                    color: SOFT_SLATE.textPrimary,
                  }}
                >
                  {isError
                    ? "Something went wrong"
                    : "Product not found"}
                </h3>

                <p
                  style={{
                    margin: 0,
                    maxWidth: 420,

                    fontFamily: SOFT_SLATE.fontFamily,
                    fontSize: 12.5,
                    lineHeight: 1.6,

                    color: SOFT_SLATE.textSecondary,
                  }}
                >
                  {isError
                    ? "We couldn't load this comparison. Check your connection and try again."
                    : "We couldn't find a match for the second barcode. It may not be in the database yet — try scanning again or search by name."}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    isError
                      ? setScenario("initial")
                      : go("barcode")
                  }
                  style={{
                    marginTop: 8,

                    padding: "12px 24px",

                    border: "none",
                    borderRadius: 15,

                    background: SOFT_SLATE.bg,
                    color: SOFT_SLATE.green,

                    fontFamily: SOFT_SLATE.fontFamily,
                    fontWeight: 800,
                    fontSize: 12.5,

                    boxShadow: SOFT_SLATE.raisedBtn,

                    cursor: "pointer",
                  }}
                >
                  {isError ? "Retry" : "Try again"}
                </button>
              </div>
            </Center>
          </div>
        </div>
      </div>
    )
  }

  // ── Main content ─────────────────────────────────────────────────────────

  const insights = buildInsights(
    a,
    b,
    recommendation
  )

  return (
    <div
      style={{
        flex: 1,
        display: "flex",

        background: SOFT_SLATE.bg,

        overflow: "hidden",
        position: "relative",

        fontFamily: SOFT_SLATE.fontFamily,
      }}
    >
      {/* ── Dashboard-style icon rail ───────────────────────────────────── */}

      <DashboardIconRail
        go={go}
        isDesktop={isDesktop}
        active="productCompare"
        navItems={[
          {
            screen: "dashboard",
            label: "Dashboard",
            path: null,
          },
          {
            screen: "productCompare",
            label: "Compare Products",
            path: null,
          },
          {
            screen: "history",
            label: "Scan History",
            path: null,
          },
          {
            screen: "settings",
            label: "Settings",
            path: null,
          },
          {
            screen: "help",
            label: "Help & FAQ",
            path: null,
          },
          {
            screen: "about",
            label: "About",
            path: null,
          },
        ]}
      />

      {/* ── Mobile menu button ────────────────────────────────────────────── */}

      {!isDesktop && !navOpen && (
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open menu"
          style={{
            position: "fixed",
            top: `calc(${SAFE_TOP} + 14px)`,
            left: 14,

            zIndex: 55,

            width: 42,
            height: 42,

            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            border: "none",
            borderRadius: 14,

            background: SOFT_SLATE.bg,
            color: SOFT_SLATE.green,

            boxShadow: SOFT_SLATE.raisedSm,

            cursor: "pointer",

            fontSize: 18,
          }}
        >
          ☰
        </button>
      )}

      {/* ── Main area ─────────────────────────────────────────────────────── */}

      <div
        style={{
          flex: 1,
          minWidth: 0,

          display: "flex",
          flexDirection: "column",

          marginLeft: isDesktop ? 80 : 0,
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}

        <div
          style={{
            padding: `${
              isDesktop
                ? "40px"
                : `calc(${SAFE_TOP} + 66px)`
            } ${H_PAD}px 10px`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <BackBtn onPress={goBack} />

            <div>
              <h1
                style={{
                  margin: 0,

                  fontFamily: SOFT_SLATE.fontFamily,
                  fontWeight: 800,
                  fontSize: 23,

                  color: SOFT_SLATE.textPrimary,

                  letterSpacing: "-0.02em",
                }}
              >
                Compare Products
              </h1>

              <p
                style={{
                  margin: "5px 0 0",

                  fontFamily: SOFT_SLATE.fontFamily,
                  fontSize: 12.5,

                  color: SOFT_SLATE.textSecondary,
                }}
              >
                Side-by-side ingredient, nutrition, and allergy comparison.
              </p>
            </div>
          </div>
        </div>

        {/* ── Scroll content ─────────────────────────────────────────────── */}

        <div
          style={{
            flex: 1,

            overflowY: "auto",

            padding: `10px ${H_PAD}px ${
              isDesktop ? 60 : 45
            }px`,
          }}
        >
          <Center maxWidth={1080}>

            {/* ── Incomplete data notice ─────────────────────────────────── */}

            {scenario === "incomplete" && (
              <div
                style={{
                  ...raisedCard,

                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,

                  padding: "15px 18px",

                  marginBottom: 24,

                  borderRadius: 18,

                  boxShadow: SOFT_SLATE.raisedSm,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",

                    flexShrink: 0,

                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",

                    background: SOFT_SLATE.bg,

                    boxShadow: SOFT_SLATE.insetSm,

                    color: SOFT_SLATE.caution,

                    fontWeight: 900,
                    fontSize: 15,
                  }}
                >
                  !
                </div>

                <div>
                  <strong
                    style={{
                      display: "block",

                      fontFamily: SOFT_SLATE.fontFamily,
                      fontSize: 12.5,
                      fontWeight: 800,

                      color: SOFT_SLATE.textPrimary,
                    }}
                  >
                    Product B is missing data
                  </strong>

                  <span
                    style={{
                      display: "block",
                      marginTop: 3,

                      fontFamily: SOFT_SLATE.fontFamily,
                      fontSize: 11.5,
                      lineHeight: 1.5,

                      color: SOFT_SLATE.textSecondary,
                    }}
                  >
                    Ingredients, allergens, and nutrition grade weren't
                    returned by the backend. Nothing has been guessed to
                    fill the gaps.
                  </span>
                </div>
              </div>
            )}

            {/* ── Product ─────────────────────────────────────────────────── */}

            <Section title="Product">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isDesktop
                    ? "repeat(2, minmax(0, 1fr))"
                    : "1fr 1fr",
                  gap: isDesktop ? 22 : 11,
                }}
              >
                <ProductCard
                  label="A"
                  product={a}
                  winner={recommendation === "a"}
                />

                <ProductCard
                  label="B"
                  product={b}
                  winner={recommendation === "b"}
                />
              </div>
            </Section>

            {/* ── Allergy & Safety ───────────────────────────────────────── */}

            <Section
              title="Allergy & Safety Verdict"
              description="Whether each product is safe to eat against your saved allergy and health profile."
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isDesktop
                    ? "repeat(2, minmax(0, 1fr))"
                    : "1fr 1fr",
                  gap: isDesktop ? 22 : 11,
                }}
              >
                <CompareCard
                  accent={recommendation === "a"}
                >
                  <StatusBadge
                    verdict={a.verdict}
                    reason={a.verdictReason}
                    size="lg"
                  />

                  <div>
                    <p
                      style={{
                        margin: "0 0 10px",

                        fontFamily: SOFT_SLATE.fontFamily,
                        fontSize: 10.5,
                        fontWeight: 800,
                        letterSpacing: "0.07em",
                        textTransform: "uppercase",

                        color: SOFT_SLATE.textMuted,
                      }}
                    >
                      Allergens detected
                    </p>

                    <AllergenList
                      allergens={a.allergens}
                    />
                  </div>
                </CompareCard>

                <CompareCard
                  accent={recommendation === "b"}
                >
                  <StatusBadge
                    verdict={b.verdict}
                    reason={b.verdictReason}
                    size="lg"
                  />

                  <div>
                    <p
                      style={{
                        margin: "0 0 10px",

                        fontFamily: SOFT_SLATE.fontFamily,
                        fontSize: 10.5,
                        fontWeight: 800,
                        letterSpacing: "0.07em",
                        textTransform: "uppercase",

                        color: SOFT_SLATE.textMuted,
                      }}
                    >
                      Allergens detected
                    </p>

                    <AllergenList
                      allergens={b.allergens}
                    />
                  </div>
                </CompareCard>
              </div>
            </Section>

            {/* ── Ingredients ────────────────────────────────────────────── */}

            <Section
              title="Ingredient Breakdown"
              description="Ingredients tied to a flagged allergen are highlighted; the rest are listed for reference."
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isDesktop
                    ? "repeat(2, minmax(0, 1fr))"
                    : "1fr 1fr",
                  gap: isDesktop ? 22 : 11,
                }}
              >
                <CompareCard>
                  <p
                    style={{
                      margin: 0,

                      fontFamily: SOFT_SLATE.fontFamily,
                      fontSize: 11,
                      fontWeight: 800,

                      color: SOFT_SLATE.textPrimary,
                    }}
                  >
                    {a.name}
                  </p>

                  <div
                    style={{
                      ...insetCard,
                      padding: 10,
                    }}
                  >
                    <IngredientBreakdown
                      product={a}
                    />
                  </div>
                </CompareCard>

                <CompareCard>
                  <p
                    style={{
                      margin: 0,

                      fontFamily: SOFT_SLATE.fontFamily,
                      fontSize: 11,
                      fontWeight: 800,

                      color: SOFT_SLATE.textPrimary,
                    }}
                  >
                    {b.name}
                  </p>

                  <div
                    style={{
                      ...insetCard,
                      padding: 10,
                    }}
                  >
                    <IngredientBreakdown
                      product={b}
                    />
                  </div>
                </CompareCard>
              </div>
            </Section>

            {/* ── Nutrition ──────────────────────────────────────────────── */}

            <Section title="Nutrition Comparison">
              <div
                style={{
                  ...raisedCard,

                  padding: isDesktop ? 22 : 14,

                  overflow: "hidden",
                }}
              >
                <p
                  style={{
                    margin: "0 0 15px",

                    fontFamily: SOFT_SLATE.fontFamily,
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",

                    color: SOFT_SLATE.textMuted,
                  }}
                >
                  Nutrition Comparison — per 100g
                </p>

                <div
                  style={{
                    ...insetCard,

                    padding: isDesktop ? 12 : 8,

                    overflowX: "auto",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      minWidth: 500,

                      borderCollapse: "separate",
                      borderSpacing: "0 5px",

                      fontFamily: SOFT_SLATE.fontFamily,
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "7px 10px",

                            fontSize: 10,
                            fontWeight: 800,

                            color: SOFT_SLATE.textMuted,
                          }}
                        >
                          Nutrition
                        </th>

                        <th
                          style={{
                            textAlign: "right",
                            padding: "7px 10px",

                            fontSize: 10.5,
                            fontWeight: 800,

                            color: SOFT_SLATE.textPrimary,
                          }}
                        >
                          {a.name}
                        </th>

                        <th
                          style={{
                            textAlign: "right",
                            padding: "7px 10px",

                            fontSize: 10.5,
                            fontWeight: 800,

                            color: SOFT_SLATE.textPrimary,
                          }}
                        >
                          {b.name}
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {NUTRITION_ROWS.map((row) => {
                        const av =
                          a.nutrition?.[row.key]

                        const bv =
                          b.nutrition?.[row.key]

                        return (
                          <tr key={row.key}>
                            <td
                              style={{
                                padding: "10px",

                                background: SOFT_SLATE.bg,

                                borderRadius: 10,

                                fontSize: 12,
                                color: SOFT_SLATE.textSecondary,

                                boxShadow:
                                  SOFT_SLATE.raisedSm,
                              }}
                            >
                              {row.label}
                            </td>

                            <td
                              style={{
                                padding: "10px",

                                textAlign: "right",

                                background: SOFT_SLATE.bg,

                                fontSize: 12.5,
                                fontWeight:
                                  av === undefined
                                    ? 400
                                    : 800,

                                color:
                                  av === undefined
                                    ? SOFT_SLATE.textMuted
                                    : SOFT_SLATE.textPrimary,

                                fontStyle:
                                  av === undefined
                                    ? "italic"
                                    : "normal",

                                boxShadow:
                                  SOFT_SLATE.raisedSm,
                              }}
                            >
                              {av === undefined
                                ? "—"
                                : `${av}${row.unit}`}
                            </td>

                            <td
                              style={{
                                padding: "10px",

                                textAlign: "right",

                                background: SOFT_SLATE.bg,

                                fontSize: 12.5,
                                fontWeight:
                                  bv === undefined
                                    ? 400
                                    : 800,

                                color:
                                  bv === undefined
                                    ? SOFT_SLATE.textMuted
                                    : SOFT_SLATE.textPrimary,

                                fontStyle:
                                  bv === undefined
                                    ? "italic"
                                    : "normal",

                                boxShadow:
                                  SOFT_SLATE.raisedSm,
                              }}
                            >
                              {bv === undefined
                                ? "—"
                                : `${bv}${row.unit}`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </Section>

            {/* ── Key Insights ───────────────────────────────────────────── */}

            <Section
              title="Key Insights"
              description="What stands out between these two products, at a glance."
            >
              <div
                style={{
                  ...raisedCard,

                  padding: isDesktop ? 24 : 16,

                  display: "flex",
                  flexDirection: "column",
                  gap: 17,

                  boxShadow:
                    recommendation === "none"
                      ? SOFT_SLATE.raisedMd
                      : `
                        0 0 0 2px ${SOFT_SLATE.green},
                        ${SOFT_SLATE.raisedMd}
                      `,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 13,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",

                      flexShrink: 0,

                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",

                      background: SOFT_SLATE.bg,

                      boxShadow:
                        recommendation === "none"
                          ? SOFT_SLATE.insetMd
                          : SOFT_SLATE.raisedSm,

                      color:
                        recommendation === "none"
                          ? SOFT_SLATE.textMuted
                          : SOFT_SLATE.green,

                      fontSize: 18,
                      fontWeight: 900,
                    }}
                  >
                    {recommendation === "none"
                      ? "—"
                      : "✓"}
                  </div>

                  <div>
                    <p
                      style={{
                        margin: 0,

                        fontFamily: SOFT_SLATE.fontFamily,
                        fontWeight: 800,
                        fontSize: 16,

                        color: SOFT_SLATE.textPrimary,
                      }}
                    >
                      {recommendation === "none"
                        ? "No clear recommendation"
                        : (
                          <>
                            <span
                              style={{
                                color: SOFT_SLATE.green,
                              }}
                            >
                              {recommendation === "a"
                                ? a.name
                                : b.name}
                            </span>{" "}
                            is the better choice
                          </>
                        )}
                    </p>

                    <p
                      style={{
                        margin: "4px 0 0",

                        fontFamily: SOFT_SLATE.fontFamily,
                        fontSize: 12,
                        lineHeight: 1.55,

                        color: SOFT_SLATE.textSecondary,
                      }}
                    >
                      {recommendation === "none"
                        ? "Both products score too closely, or key data is missing, for Scanity to call a clear winner."
                        : "Based on nutrition grade, ingredient quality, and your saved health profile."}
                    </p>
                  </div>
                </div>

                {insights.length > 0 && (
                  <div
                    style={{
                      ...insetCard,

                      padding: 14,

                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {insights.map(
                      (insight, index) => (
                        <div
                          key={index}
                          style={{
                            display: "flex",
                            gap: 9,

                            fontFamily:
                              SOFT_SLATE.fontFamily,

                            fontSize: 12,
                            lineHeight: 1.55,

                            color:
                              SOFT_SLATE.textSecondary,
                          }}
                        >
                          <span
                            style={{
                              color:
                                SOFT_SLATE.green,
                              fontWeight: 900,
                            }}
                          >
                            •
                          </span>

                          <span>{insight}</span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </Section>

            {/* ── Add another product ────────────────────────────────────── */}

            <button
              type="button"
              onClick={() =>
                setScenario("initial")
              }
              style={{
                width: "100%",

                marginTop: 30,

                padding: 15,

                border: "none",
                borderRadius: 17,

                background: SOFT_SLATE.bg,

                color: SOFT_SLATE.green,

                fontFamily: SOFT_SLATE.fontFamily,
                fontWeight: 800,
                fontSize: 13,

                boxShadow: SOFT_SLATE.raisedBtn,

                cursor: "pointer",
              }}
            >
              + Add another product
            </button>

          </Center>
        </div>
      </div>
    </div>
  )
}

// Same data the Dashboard panel reads from — no separate placeholder set.
function ScanHistoryScreen({ go }: { go: (s: Screen) => void }) {
  const [query, setQuery] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useIsDesktop()

  const scans = RECENT_SCANS.filter((scan) =>
    scan.name.toLowerCase().includes(query.toLowerCase()),
  )

  // Rail geometry mirrors DashboardScreen's own fixed positioning exactly
  // (top/left/bottom 22/26/22, width 80) so the two screens line up pixel
  // for pixel, not just in color.
  const RAIL_TOP = 22
  const RAIL_SIDE = 26
  const RAIL_W = 80

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: SOFT_SLATE.bg,
        fontFamily: SOFT_SLATE.fontFamily,
      }}
    >
      {/* SIDEBAR — mobile drawer only; desktop uses the Soft Slate rail below,
          same component and shading as the Dashboard. */}
      {!isDesktop && (
        <AppSidebar
          go={go}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isDesktop={false}
          active="history"
        />
      )}

      {/* ICON RAIL — Dashboard's own rail component, reused as-is: same
          Soft Slate raised/inset shading, just its own "Scan History" nav
          set with History highlighted instead of Dashboard. */}
      {isDesktop && (
        <div
          style={{
            position: "fixed",
            top: RAIL_TOP,
            left: RAIL_SIDE,
            bottom: RAIL_TOP,
            width: RAIL_W,
            zIndex: 5,
          }}
        >
        <DashboardIconRail go={go} isDesktop />

        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          background: SOFT_SLATE.bg,
          overflow: "hidden",
          marginLeft: isDesktop ? RAIL_W + RAIL_SIDE + RAIL_SIDE : 0,
        }}
      >
        {/* MOBILE MENU BUTTON — the rail stands in for this on desktop */}
        {!isDesktop && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              padding: "14px 20px 0",
            }}
          >
            <Tooltip label="Open menu">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
                style={{
                  width: 34,
                  height: 34,
                  border: "none",
                  borderRadius: 12,
                  background: SOFT_SLATE.bg,
                  color: SOFT_SLATE.green,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: SOFT_SLATE.raisedSm,
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            </Tooltip>
          </div>
        )}

        {/* CONTENT */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
          }}
        >
          <Center
            maxWidth={900}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: isDesktop ? "40px 32px 32px" : "16px 20px 32px",
            }}
          >
            {/* HEADER — "1a Grouped activity list" layout, Dashboard's Soft
                Slate palette. */}
            <h1
              style={{
                margin: "0 0 4px",
                color: SOFT_SLATE.textPrimary,
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 26,
                fontWeight: 800,
                lineHeight: 1.2,
              }}
            >
              Scan History
            </h1>
            <p
              style={{
                margin: "0 0 18px",
                color: SOFT_SLATE.textMuted,
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 12.5,
              }}
            >
              Everything you've scanned, newest first.
            </p>

            {/* SEARCH — inset (pressed-in) like a Soft Slate field, rather
                than the raised look used for buttons/cards. */}
            <div style={{ position: "relative", marginBottom: 22 }}>
              <i
                className="fa fa-search"
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 18,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 12,
                  color: SOFT_SLATE.textMuted,
                }}
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search products"
                aria-label="Search scans"
                style={{
                  width: "100%",
                  padding: "12px 16px 12px 40px",
                  boxSizing: "border-box",
                  borderRadius: 999,
                  border: "none",
                  background: SOFT_SLATE.bg,
                  color: SOFT_SLATE.textPrimary,
                  outline: "none",
                  fontFamily: SOFT_SLATE.fontFamily,
                  fontSize: 12.5,
                  boxShadow: SOFT_SLATE.insetMd,
                }}
              />
            </div>

            {/* SCAN HISTORY — a date-section header (label + count) sits on
                the page background above its own panel, and each panel
                holds only that day's rows. */}
            <div style={{ width: "100%", minHeight: 500, boxSizing: "border-box" }}>
              {scans.length === 0 ? (
                <div
                  style={{
                    borderRadius: 26,
                    background: SOFT_SLATE.bg,
                    boxShadow: SOFT_SLATE.raisedLg,
                    padding: "8px 16px",
                    boxSizing: "border-box",
                  }}
                >
                  {/* EMPTY STATE */}
                  <p
                    style={{
                      margin: 0,
                      padding: "40px 0",
                      color: SOFT_SLATE.textMuted,
                      fontFamily: SOFT_SLATE.fontFamily,
                      fontSize: 12,
                      textAlign: "center",
                    }}
                  >
                    No scans found.
                  </p>
                </div>
              ) : (
                groupScans(scans).map((group) => (
                  <div
                    key={`${group.label}-${group.scans[0].name}-${group.scans[0].time}`}
                    style={{ marginBottom: 20 }}
                  >
                    {/* GROUP HEADER */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        padding: "0 4px 8px",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: SOFT_SLATE.fontFamily,
                          fontWeight: 800,
                          fontSize: 12,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          color: SOFT_SLATE.textPrimary,
                        }}
                      >
                        {group.label}
                      </span>
                      <span
                        style={{
                          fontFamily: SOFT_SLATE.fontFamily,
                          fontSize: 11,
                          color: SOFT_SLATE.textMuted,
                        }}
                      >
                        {group.scans.length} scan{group.scans.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    {/* GROUP PANEL — raised, borderless, same shading as the
                        Dashboard's own "Scan History" card. */}
                    <div
                      style={{
                        borderRadius: 26,
                        background: SOFT_SLATE.bg,
                        boxShadow: SOFT_SLATE.raisedLg,
                        padding: "8px 16px",
                        boxSizing: "border-box",
                      }}
                    >
                      {group.scans.map((scan, index) => (
                        <ScanRow
                          key={`${scan.name}-${scan.time}`}
                          scan={scan}
                          onView={() => go("productResult")}
                          showDate={group.showDate}
                          isLast={index === group.scans.length - 1}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Center>
        </div>
      </div>
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) return "?"

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function PreferenceChip({
  active,
  iconSrc,
  iconBg,
  label,
  onClick,
  accent = "green",
}: {
  active: boolean
  iconSrc: string
  iconBg: string
  label: string
  onClick: () => void
  accent?: "green" | "red"
}) {
  const tone =
    accent === "red"
      ? {
          border: PALETTE.danger,
          bg: PALETTE.dangerBg,
          check: PALETTE.danger,
        }
      : {
          border: PALETTE.green,
          bg: PALETTE.greenLight,
          check: PALETTE.green,
        }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "6px 13px 6px 6px",
        borderRadius: 999,
        border: `1.5px solid ${
          active ? tone.border : PALETTE.border
        }`,
        background: active ? tone.bg : PALETTE.page,
        cursor: "pointer",
        transition:
          "border-color 0.16s ease, background 0.16s ease",
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <img
          src={iconSrc}
          alt=""
          width={13}
          height={13}
          style={{
            filter: "brightness(0) invert(1)",
          }}
        />
      </span>

      <span
        style={{
          fontFamily: FONT_BODY,
          fontWeight: active ? 700 : 500,
          fontSize: 12.5,
          color: PALETTE.textDark,
        }}
      >
        {label}
      </span>

      {active && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          fill="none"
          style={{
            flexShrink: 0,
          }}
        >
          <polyline
            points="12 3 5.5 10 2 6.5"
            stroke={tone.check}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}

/*
 * The "Other" chip doubles as the add affordance for allergies/conditions
 * that aren't in the preset list.
 *
 * When clicked, it opens into a small text field right where the chip is.
 */
function OtherChip({
  active,
  value,
  onToggle,
  onChangeText,
  placeholder,
}: {
  active: boolean
  value: string
  onToggle: () => void
  onChangeText: (v: string) => void
  placeholder: string
}) {
  return (
    <div
      onClick={!active ? onToggle : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "6px 10px 6px 6px",
        borderRadius: 999,
        border: `1.5px solid ${
          active ? PALETTE.green : PALETTE.border
        }`,
        background: active ? PALETTE.greenLight : PALETTE.page,
        cursor: active ? "text" : "pointer",
        transition:
          "border-color 0.16s ease, background 0.16s ease",
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: "#8A6FC4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </span>

      {active ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => onChangeText(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder={placeholder}
          style={{
            width: 132,
            background: "transparent",
            border: "none",
            outline: "none",
            fontFamily: FONT_BODY,
            fontWeight: 500,
            fontSize: 12.5,
            color: PALETTE.textDark,
          }}
        />
      ) : (
        <span
          style={{
            fontFamily: FONT_BODY,
            fontWeight: 500,
            fontSize: 12.5,
            color: "rgba(26,26,26,0.7)",
          }}
        >
          Other
        </span>
      )}

      {active && (
        <Tooltip label="Remove">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChangeText("")
              onToggle()
            }}
            aria-label="Remove"
            style={{
              border: "none",
              background: "none",
              color: "rgba(26,26,26,0.4)",
              cursor: "pointer",
              padding: 0,
              display: "flex",
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </Tooltip>
      )}
    </div>
  )
}

const PRF_EYEBROW: CSSProperties = {
  margin: 0,
  fontFamily: FONT_HEAD,
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "rgba(26,26,26,0.4)",
}

const PRF_HEADING: CSSProperties = {
  margin: 0,
  fontFamily: FONT_HEAD,
  fontWeight: 700,
  fontSize: 14.5,
  color: PALETTE.textDark,
}

const PRF_SUPPORTING: CSSProperties = {
  margin: "4px 0 0",
  fontFamily: FONT_BODY,
  fontSize: 11.5,
  lineHeight: 1.5,
  color: "rgba(26,26,26,0.55)",
  maxWidth: 440,
}

function ProfileScreen({
  go,
}: {
  go: (s: Screen) => void
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isDesktop = useIsDesktop()

  // ── Identity ─────────────────────────────────────────────────────────────
  const [name, setName] = useState("Cedric Hamilton")
  const [email, setEmail] = useState(
    "cedrichamilton@gmail.com"
  )

  const [editingIdentity, setEditingIdentity] =
    useState(false)

  const [draftName, setDraftName] = useState(name)
  const [draftEmail, setDraftEmail] = useState(email)

  // ── Profile picture ──────────────────────────────────────────────────────
  const [avatarUrl, setAvatarUrl] =
    useState<string | null>(null)

  const avatarInputRef =
    useRef<HTMLInputElement>(null)

  const openAvatarPicker = () => {
    avatarInputRef.current?.click()
  }

  const handleAvatarChange = (
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0]

    if (!file) return

    const reader = new FileReader()

    reader.onload = () => {
      setAvatarUrl(reader.result as string)
    }

    reader.readAsDataURL(file)

    // Allow re-selecting the same file later
    e.target.value = ""
  }

  // ── Saved preferences ────────────────────────────────────────────────────
  const [savedAllergies, setSavedAllergies] =
    useState<Set<string>>(
      new Set(["peanuts", "dairy"])
    )

  const [allergies, setAllergies] =
    useState<Set<string>>(
      new Set(savedAllergies)
    )

  const [savedHealth, setSavedHealth] =
    useState<Set<string>>(
      new Set(["hypertension"])
    )

  const [health, setHealth] =
    useState<Set<string>>(
      new Set(savedHealth)
    )

  const [otherAllergy, setOtherAllergy] =
    useState("")

  const [otherHealth, setOtherHealth] =
    useState("")

  const watchPanelRef =
    useRef<HTMLDivElement>(null)

  // ── Toggle allergy ───────────────────────────────────────────────────────
  const toggleAllergy = (id: string) => {
    setAllergies((prev) => {
      const next = new Set(prev)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }

  // ── Toggle health condition ──────────────────────────────────────────────
  const toggleHealth = (id: string) => {
    setHealth((prev) => {
      const next = new Set(prev)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }

  // ── Compare sets ─────────────────────────────────────────────────────────
  const setsEqual = (
    a: Set<string>,
    b: Set<string>
  ) => {
    return (
      a.size === b.size &&
      [...a].every((v) => b.has(v))
    )
  }

  // ── Check if there are unsaved changes ───────────────────────────────────
  const isDirty =
    !setsEqual(allergies, savedAllergies) ||
    !setsEqual(health, savedHealth)

  // ── Save preferences ────────────────────────────────────────────────────
  const handleSave = () => {
    setSavedAllergies(new Set(allergies))
    setSavedHealth(new Set(health))
  }

  // ── Start editing identity ───────────────────────────────────────────────
  const startEditingIdentity = () => {
    setDraftName(name)
    setDraftEmail(email)
    setEditingIdentity(true)
  }

  // ── Scroll to preference panel ───────────────────────────────────────────
  const scrollToWatchPanel = () => {
    watchPanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  // ── Profile information ──────────────────────────────────────────────────
  const joinedLabel = "March 2026"

  const profileBadge =
    savedAllergies.size > 0 ||
    savedHealth.size > 0
      ? "Health Conscious"
      : "Getting Started"

  const avoidsLabel =
    ALLERGY_LIST
      .filter((i) =>
        savedAllergies.has(i.id)
      )
      .map((i) => i.label)
      .join(", ") ||
    "Nothing saved yet"

  const watchingLabel =
    HEALTH_LIST
      .filter((i) =>
        savedHealth.has(i.id)
      )
      .map((i) => i.label)
      .join(", ") ||
    "Nothing saved yet"

  const labelsScanned =
    RECENT_SCANS.length

  const lastScan = RECENT_SCANS[0]

  const lastScanLabel = lastScan
    ? `${lastScan.name} · ${lastScan.date}`
    : "No scans yet"

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <AppSidebar
        go={go}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isDesktop={isDesktop}
        active="profile"
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          background: PALETTE.page,
          color: PALETTE.textDark,
          overflow: "hidden",
          marginLeft: isDesktop
            ? SIDEBAR_WIDTH
            : 0,
        }}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <InfoHeader
          title="My Profile"
          subtitle="Your saved details and preferences"
          go={go}
          backTo="dashboard"
          showBack={false}
          onMobileMenuClick={() =>
            setSidebarOpen(true)
          }
        />

        {/* ── Scrollable content ───────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
          }}
        >
          <Center
            maxWidth={
              isDesktop ? 960 : 680
            }
            style={{
              padding: isDesktop
                ? "48px 32px 48px"
                : "26px 20px 40px",
            }}
          >
            {/* ────────────────────────────────────────────────────────────
                IDENTITY CARD
            ──────────────────────────────────────────────────────────── */}
            <div
              style={{
                position: "relative",
                borderRadius: 20,
                background: PALETTE.panel,
                border: `1.5px solid ${PALETTE.border}`,
                boxShadow: cardShadow,
                overflow: "hidden",
                paddingTop: 14,
              }}
            >
              {/* Profile badge */}
              {!editingIdentity && (
                <span
                  style={{
                    position: "absolute",
                    top: 14,
                    left: 16,
                    padding: "3px 11px",
                    borderRadius: 999,
                    background:
                      PALETTE.greenLight,
                    border: `1px solid ${PALETTE.green}`,
                    fontFamily: FONT_HEAD,
                    fontWeight: 700,
                    fontSize: 9.5,
                    letterSpacing: "0.03em",
                    color:
                      PALETTE.greenText,
                  }}
                >
                  {profileBadge}
                </span>
              )}

              {/* Identity content */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: isDesktop
                    ? "26px 30px 30px"
                    : "18px 22px 22px",
                  textAlign: "center",
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    position: "relative",
                  }}
                >
                  {/* Hidden file input backing the avatar upload */}
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={
                      handleAvatarChange
                    }
                    style={{
                      display: "none",
                    }}
                  />

                  <Tooltip
                    label={
                      avatarUrl
                        ? "Change profile picture"
                        : "Add profile picture"
                    }
                  >
                    <button
                      type="button"
                      onClick={
                        openAvatarPicker
                      }
                      aria-label={
                        avatarUrl
                          ? "Change profile picture"
                          : "Add profile picture"
                      }
                      style={{
                        width: isDesktop
                          ? 92
                          : 76,
                        height: isDesktop
                          ? 92
                          : 76,
                        borderRadius:
                          "50%",
                        padding: 0,
                        background:
                          avatarUrl
                            ? "transparent"
                            : PALETTE.goldDark,
                        border: `3px solid ${PALETTE.goldDark}`,
                        display: "flex",
                        alignItems:
                          "center",
                        justifyContent:
                          "center",
                        boxShadow:
                          "0 4px 10px rgba(0,0,0,0.12)",
                        cursor: "pointer",
                        overflow: "hidden",
                      }}
                    >
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="Profile"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit:
                              "cover",
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            fontFamily:
                              FONT_HEAD,
                            fontWeight: 600,
                            fontSize:
                              isDesktop
                                ? 28
                                : 23,
                            color:
                              PALETTE.brown,
                          }}
                        >
                          {initials(name)}
                        </span>
                      )}
                    </button>
                  </Tooltip>

                  {/* Add/change photo badge */}
                  <Tooltip
                    label={
                      avatarUrl
                        ? "Change profile picture"
                        : "Add profile picture"
                    }
                    wrapperStyle={{
                      position:
                        "absolute",
                      bottom: -2,
                      left: -2,
                    }}
                  >
                    <button
                      type="button"
                      onClick={
                        openAvatarPicker
                      }
                      aria-label={
                        avatarUrl
                          ? "Change profile picture"
                          : "Add profile picture"
                      }
                      style={{
                        width: 24,
                        height: 24,
                        display: "flex",
                        alignItems:
                          "center",
                        justifyContent:
                          "center",
                        borderRadius:
                          "50%",
                        border: `1.5px solid ${C.white}`,
                        background:
                          C.green,
                        color: C.white,
                        cursor:
                          "pointer",
                        boxShadow:
                          "0 2px 6px rgba(0,0,0,0.18)",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle
                          cx="12"
                          cy="13"
                          r="4"
                        />
                      </svg>
                    </button>
                  </Tooltip>

                  {/* Edit button */}
                  {!editingIdentity && (
                    <Tooltip
                      label="Edit name and email"
                      wrapperStyle={{
                        position:
                          "absolute",
                        bottom: -2,
                        right: -2,
                      }}
                    >
                      <button
                        type="button"
                        onClick={
                          startEditingIdentity
                        }
                        aria-label="Edit name and email"
                        style={{
                          width: 24,
                          height: 24,
                          display: "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "center",
                          borderRadius:
                            "50%",
                          border: `1.5px solid ${PALETTE.panel}`,
                          background:
                            PALETTE.green,
                          color:
                            "#FFFFFF",
                          cursor:
                            "pointer",
                          boxShadow:
                            "0 2px 6px rgba(0,0,0,0.18)",
                        }}
                      >
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                      </button>
                    </Tooltip>
                  )}
                </div>

                {/* Name / edit form */}
                {!editingIdentity ? (
                  <>
                    <h3
                      style={{
                        margin:
                          "12px 0 0",
                        fontFamily:
                          FONT_HEAD,
                        fontWeight: 600,
                        fontSize:
                          isDesktop
                            ? 23
                            : 19,
                        color:
                          PALETTE.brown,
                      }}
                    >
                      {name}
                    </h3>

                    <span
                      style={{
                        display: "block",
                        width: 34,
                        height: 3,
                        borderRadius: 2,
                        background:
                          PALETTE.brown,
                        margin:
                          "7px auto 0",
                      }}
                    />
                  </>
                ) : (
                  <div
                    style={{
                      marginTop: 18,
                      width: "100%",
                      maxWidth: 360,
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: 14,
                      }}
                    >
                      {/* Name */}
                      <label
                        style={{
                          display: "flex",
                          flexDirection:
                            "column",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            fontFamily:
                              FONT_BODY,
                            fontSize: 11,
                            fontWeight: 600,
                            color:
                              PALETTE.textMuted,
                          }}
                        >
                          Name
                        </span>

                        <input
                          autoFocus
                          value={
                            draftName
                          }
                          onChange={(e) =>
                            setDraftName(
                              e.target
                                .value
                            )
                          }
                          placeholder="Your name"
                          style={{
                            fontFamily:
                              FONT_HEAD,
                            fontWeight: 700,
                            fontSize: 14,
                            color:
                              PALETTE.textDark,
                            background:
                              PALETTE.page,
                            border: `1.5px solid ${PALETTE.border}`,
                            borderRadius: 10,
                            padding:
                              "10px 12px",
                            outline:
                              "none",
                            boxSizing:
                              "border-box",
                            width:
                              "100%",
                          }}
                        />
                      </label>

                      {/* Email */}
                      <label
                        style={{
                          display: "flex",
                          flexDirection:
                            "column",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            fontFamily:
                              FONT_BODY,
                            fontSize: 11,
                            fontWeight: 600,
                            color:
                              PALETTE.textMuted,
                          }}
                        >
                          Email Address
                        </span>

                        <input
                          value={
                            draftEmail
                          }
                          onChange={(e) =>
                            setDraftEmail(
                              e.target
                                .value
                            )
                          }
                          placeholder="you@email.com"
                          style={{
                            fontFamily:
                              FONT_BODY,
                            fontWeight: 600,
                            fontSize: 13,
                            color:
                              PALETTE.textDark,
                            background:
                              PALETTE.page,
                            border: `1.5px solid ${PALETTE.border}`,
                            borderRadius: 10,
                            padding:
                              "10px 12px",
                            outline:
                              "none",
                            boxSizing:
                              "border-box",
                            width:
                              "100%",
                          }}
                        />
                      </label>
                    </div>

                    {/* Edit actions */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent:
                          "flex-end",
                        gap: 8,
                        marginTop: 16,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setName(
                            draftName.trim() ||
                              name
                          )

                          setEmail(
                            draftEmail.trim() ||
                              email
                          )

                          setEditingIdentity(
                            false
                          )
                        }}
                        style={{
                          padding:
                            "9px 20px",
                          borderRadius: 10,
                          border: "none",
                          background:
                            PALETTE.green,
                          color:
                            "#FFFFFF",
                          fontFamily:
                            FONT_HEAD,
                          fontWeight: 700,
                          fontSize: 12,
                          cursor:
                            "pointer",
                          boxShadow:
                            "0 4px 12px rgba(23,107,58,0.22)",
                        }}
                      >
                        Save
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setEditingIdentity(
                            false
                          )
                        }
                        style={{
                          padding:
                            "9px 20px",
                          borderRadius: 10,
                          border: `1px solid ${PALETTE.border}`,
                          background:
                            "transparent",
                          color:
                            PALETTE.textMuted,
                          fontFamily:
                            FONT_HEAD,
                          fontWeight: 600,
                          fontSize: 12,
                          cursor:
                            "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Email / member since */}
              {!editingIdentity && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems:
                      "center",
                    justifyContent:
                      "space-between",
                    gap: 8,
                    padding: isDesktop
                      ? "16px 30px"
                      : "12px 22px",
                    background:
                      PALETTE.goldDark,
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      flexDirection:
                        "column",
                      gap: 2,
                    }}
                  >
                    <span
                      style={{
                        fontFamily:
                          FONT_BODY,
                        fontSize: 12,
                        color:
                          PALETTE.textDark,
                      }}
                    >
                      <strong
                        style={{
                          fontFamily:
                            FONT_HEAD,
                        }}
                      >
                        Email:
                      </strong>{" "}
                      {email}
                    </span>

                    <span
                      style={{
                        fontFamily:
                          FONT_BODY,
                        fontSize: 12,
                        color:
                          PALETTE.textDark,
                      }}
                    >
                      <strong
                        style={{
                          fontFamily:
                            FONT_HEAD,
                        }}
                      >
                        Member since:
                      </strong>{" "}
                      {joinedLabel}
                    </span>
                  </span>
                </div>
              )}
            </div>

            {/* ────────────────────────────────────────────────────────────
                ABOUT YOU
            ──────────────────────────────────────────────────────────── */}
            <div
              style={{
                marginTop: 18,
              }}
            >
              {/* About you */}
              <div
                style={{
                  borderRadius: 16,
                  background:
                    PALETTE.panel,
                  border: `1.5px solid ${PALETTE.border}`,
                  boxShadow:
                    cardShadow,
                  padding: isDesktop
                    ? "22px 24px 24px"
                    : "16px 18px 18px",
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    fontFamily:
                      FONT_HEAD,
                    fontWeight: 700,
                    fontSize:
                      isDesktop
                        ? 15
                        : 13.5,
                    color:
                      PALETTE.textDark,
                    paddingBottom: 8,
                    borderBottom: `2px solid ${PALETTE.green}`,
                  }}
                >
                  About you
                </h4>

                <div
                  style={{
                    display: "flex",
                    flexDirection:
                      "column",
                    gap: isDesktop
                      ? 12
                      : 9,
                    marginTop:
                      isDesktop
                        ? 16
                        : 12,
                  }}
                >
                  {[
                    {
                      label: "Avoids",
                      value:
                        avoidsLabel,
                    },
                    {
                      label:
                        "Watching",
                      value:
                        watchingLabel,
                    },
                    {
                      label:
                        "Labels scanned",
                      value:
                        String(
                          labelsScanned
                        ),
                    },
                    {
                      label:
                        "Last scan",
                      value:
                        lastScanLabel,
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      style={{
                        display:
                          "flex",
                        justifyContent:
                          "space-between",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          fontFamily:
                            FONT_BODY,
                          fontSize:
                            isDesktop
                              ? 13
                              : 11.5,
                          color:
                            PALETTE.textMuted,
                          flexShrink: 0,
                        }}
                      >
                        {row.label}
                      </span>

                      <span
                        style={{
                          fontFamily:
                            FONT_BODY,
                          fontWeight: 600,
                          fontSize:
                            isDesktop
                              ? 13
                              : 11.5,
                          color:
                            PALETTE.textDark,
                          textAlign:
                            "right",
                        }}
                      >
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={
                    scrollToWatchPanel
                  }
                  style={{
                    marginTop:
                      isDesktop
                        ? 17
                        : 13,
                    padding: 0,
                    border: "none",
                    background:
                      "none",
                    fontFamily:
                      FONT_HEAD,
                    fontWeight: 700,
                    fontSize:
                      isDesktop
                        ? 13
                        : 11.5,
                    color:
                      PALETTE.green,
                    cursor:
                      "pointer",
                  }}
                >
                  Edit details →
                </button>
              </div>
            </div>

            {/* ────────────────────────────────────────────────────────────
                WHAT SCANITY WATCHES FOR YOU
            ──────────────────────────────────────────────────────────── */}
            <div
              ref={watchPanelRef}
              style={{
                borderRadius: 18,
                background:
                  PALETTE.panel,
                border: `1.5px solid ${PALETTE.border}`,
                boxShadow:
                  cardShadow,
                padding: isDesktop
                  ? "26px 30px 28px"
                  : "18px 20px 20px",
                marginTop: 18,
                scrollMarginTop: 20,
              }}
            >
              {/* Section header */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent:
                    "space-between",
                  gap: 8,
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    fontFamily:
                      FONT_HEAD,
                    fontWeight: 700,
                    fontSize:
                      isDesktop
                        ? 17
                        : 15,
                    color:
                      PALETTE.textDark,
                  }}
                >
                  What Scanity watches
                  for you
                </h4>

                {/* Save status */}
                <span
                  style={{
                    fontFamily:
                      FONT_HEAD,
                    fontWeight: 700,
                    fontSize: 10.5,
                    color: isDirty
                      ? PALETTE.cautionText
                      : PALETTE.greenText,
                    background: isDirty
                      ? "#FBF1D9"
                      : PALETTE.greenLight,
                    border: `1px solid ${
                      isDirty
                        ? "#E0C067"
                        : PALETTE.green
                    }`,
                    borderRadius: 999,
                    padding:
                      "3px 10px",
                  }}
                >
                  {isDirty
                    ? "Unsaved changes"
                    : "Everything saved"}
                </span>
              </div>

              {/* ── Allergies ─────────────────────────────────────────── */}
              <div
                style={{
                  marginTop: 18,
                  borderTop: `1px solid ${PALETTE.border}`,
                  paddingTop: 18,
                }}
              >
                <h4
                  style={PRF_HEADING}
                >
                  Allergies
                </h4>

                <p
                  style={
                    PRF_SUPPORTING
                  }
                >
                  Anything you select
                  here gets flagged the
                  moment it shows up on a
                  label.
                </p>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 13,
                  }}
                >
                  {ALLERGY_LIST
                    .filter(
                      (i) =>
                        i.id !==
                        "other"
                    )
                    .map((item) => (
                      <PreferenceChip
                        key={item.id}
                        active={allergies.has(
                          item.id
                        )}
                        iconSrc={
                          item.icon
                        }
                        iconBg={
                          item.iconBg
                        }
                        label={
                          item.label
                        }
                        onClick={() =>
                          toggleAllergy(
                            item.id
                          )
                        }
                        accent="green"
                      />
                    ))}

                  <OtherChip
                    active={allergies.has(
                      "other"
                    )}
                    value={
                      otherAllergy
                    }
                    onToggle={() =>
                      toggleAllergy(
                        "other"
                      )
                    }
                    onChangeText={
                      setOtherAllergy
                    }
                    placeholder="Name an allergy"
                  />
                </div>
              </div>

              {/* ── Health conditions ─────────────────────────────────── */}
              <div
                style={{
                  marginTop: 18,
                  borderTop: `1px solid ${PALETTE.border}`,
                  paddingTop: 18,
                }}
              >
                <h4
                  style={PRF_HEADING}
                >
                  Health conditions
                </h4>

                <p
                  style={
                    PRF_SUPPORTING
                  }
                >
                  These shape how we read
                  sodium, sugar, and
                  saturated fat on a label.
                </p>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 13,
                  }}
                >
                  {HEALTH_LIST
                    .filter(
                      (i) =>
                        i.id !==
                        "none"
                    )
                    .map((item) => (
                      <PreferenceChip
                        key={item.id}
                        active={health.has(
                          item.id
                        )}
                        iconSrc={
                          item.icon
                        }
                        iconBg={
                          item.iconBg
                        }
                        label={
                          item.label
                        }
                        onClick={() =>
                          toggleHealth(
                            item.id
                          )
                        }
                        accent="red"
                      />
                    ))}

                  <OtherChip
                    active={health.has(
                      "other"
                    )}
                    value={
                      otherHealth
                    }
                    onToggle={() =>
                      toggleHealth(
                        "other"
                      )
                    }
                    onChangeText={
                      setOtherHealth
                    }
                    placeholder="Name a condition"
                  />
                </div>
              </div>

              {/* Divider */}
              <div
                style={{
                  height: 1,
                  background:
                    PALETTE.border,
                  margin:
                    "22px 0 16px",
                }}
              />

              {/* Save section */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems:
                    "center",
                  gap: 14,
                }}
              >
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!isDirty}
                  style={{
                    padding:
                      "11px 26px",
                    borderRadius: 12,
                    border: "none",
                    background: isDirty
                      ? `linear-gradient(135deg, ${PALETTE.green}, ${PALETTE.greenDark})`
                      : PALETTE.border,
                    color: isDirty
                      ? "#FFFFFF"
                      : PALETTE.textMuted,
                    fontFamily:
                      FONT_HEAD,
                    fontWeight: 600,
                    fontSize: 12.5,
                    cursor: isDirty
                      ? "pointer"
                      : "not-allowed",
                    boxShadow: isDirty
                      ? "0 6px 18px rgba(23,107,58,0.26)"
                      : "none",
                    transition:
                      "background 0.15s ease, box-shadow 0.15s ease",
                    flexShrink: 0,
                  }}
                >
                  {isDirty
                    ? "Update profile"
                    : "No changes to update"}
                </button>

                <span
                  style={{
                    fontFamily:
                      FONT_BODY,
                    fontSize: 11,
                    color:
                      PALETTE.textMuted,
                  }}
                >
                  Changes apply to your
                  next scan.
                </span>
              </div>
            </div>
          </Center>
        </div>
      </div>
    </div>
  )
}

const FAQ_ITEMS = [
  {
    question: "How do I scan a product?",
    answer:
      "Open the scanner from your dashboard and point your camera at the barcode. Scanity will show the product's nutrition grade and relevant alerts.",
  },
  {
    question: "How are allergy alerts chosen?",
    answer:
      "Scanity compares product ingredients with the allergies and health conditions saved in your profile.",
  },
  {
    question: "Can I update my preferences?",
    answer:
      "Yes. Open My Profile from the menu, update your selections, and tap Save changes.",
  },
  {
    question: "What does the nutrition grade mean?",
    answer:
      "The A–E grade summarizes a product's ingredient and nutrition quality on its own — it isn't affected by your personal allergies or health conditions. A product can be Grade A and still be flagged unsafe for you; check the Allergy & Safety result for that.",
  },
]

function InfoHeader({
  title,
  subtitle,
  go,
  backTo,
  showBack = true,
  onMobileMenuClick,
}: {
  title: string
  subtitle: string
  go: (s: Screen) => void
  backTo?: Screen
  showBack?: boolean
  onMobileMenuClick?: () => void
}) {
  const isDesktop = useIsDesktop()

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        paddingTop: isDesktop ? 10 : `calc(${SAFE_TOP} + 10px)`,
        paddingLeft: isDesktop ? 20 : 16,
        paddingRight: 20,
        paddingBottom: 13,
        borderBottom: `1px solid ${PALETTE.border}`,
        background: PALETTE.panel,
        flexShrink: 0,
        boxSizing: "border-box",
      }}
    >
      {/* MOBILE MENU */}
      {!isDesktop && onMobileMenuClick && (
        <button
          type="button"
          onClick={onMobileMenuClick}
          aria-label="Open menu"
          style={{
            width: 38,
            height: 38,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            border: `1px solid ${PALETTE.border}`,
            background: "#EAF4EE",
            color: PALETTE.green,
            cursor: "pointer",
            boxShadow: "0 3px 10px rgba(23,107,58,0.08)",
            flexShrink: 0,
          }}
        >
          <svg
            width={18}
            height={14}
            viewBox="0 0 24 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <line x1="0" y1="1" x2="24" y2="1" />
            <line x1="0" y1="9" x2="24" y2="9" />
            <line x1="0" y1="17" x2="24" y2="17" />
          </svg>
        </button>
      )}

      {/* BACK BUTTON */}
      {showBack && (isDesktop || !onMobileMenuClick) && (
        <Tooltip label="Back">
          <button
            type="button"
            onClick={() => go(backTo ?? "dashboard")}
            aria-label="Back"
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              border: `1px solid ${PALETTE.border}`,
              background: PALETTE.panel,
              color: PALETTE.textDark,
              cursor: "pointer",
              fontSize: 20,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              flexShrink: 0,
            }}
          >
            <i className="fa fa-angle-left" />
          </button>
        </Tooltip>
      )}

      {/* TITLE */}
      <div
        style={{
          minWidth: 0,
          flex: 1,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: FONT_HEAD,
            fontSize: 23,
            fontWeight: 800,
            color: PALETTE.textDark,
            lineHeight: 1.2,
            letterSpacing: "-0.04em",
          }}
        >
          {title}
        </h2>

        {subtitle ? (
          <p
            style={{
              margin: "4px 0 0",
              fontFamily: FONT_BODY,
              fontSize: 12,
              color: "rgba(26,26,26,0.58)",
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  )
}


/* =========================================================
   HELP & FAQ
   ========================================================= */

function HelpFaqScreen({ go }: { go: (s: Screen) => void }) {
  const [openQuestion, setOpenQuestion] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useIsDesktop()

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: PALETTE.page,
        fontFamily: FONT_BODY,
      }}
    >
      <AppSidebar
        go={go}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isDesktop={isDesktop}
        active="help"
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          background: PALETTE.page,
          overflow: "hidden",
          marginLeft: isDesktop ? SIDEBAR_WIDTH : 0,
        }}
      >
        <InfoHeader
          title="Help & FAQ"
          subtitle="Answers for a safer scan"
          go={go}
          showBack={false}
          onMobileMenuClick={() => setSidebarOpen(true)}
        />

        <div
          style={{
            flex: 1,
            overflowY: "auto",
          }}
        >
          <Center
            maxWidth={isDesktop ? 1180 : undefined}
            style={{
              padding: isDesktop
                ? "24px 40px 32px"
                : "18px 12px 24px",
            }}
          >
            {/* HELP INTRO */}
            <div
              style={{
                padding: "16px",
                marginBottom: 18,
                borderRadius: 13,
                border: `1px solid rgba(224,167,46,0.28)`,
                background: PALETTE.panel,
                boxShadow: cardShadow,
              }}
            >
              <i
                className="fa fa-question-circle"
                style={{
                  color: C.greenLight,
                  fontSize: 24,
                  marginBottom: 8,
                }}
              />

              <p
                style={{
                  margin: 0,
                  fontFamily: FONT_HEAD,
                  color: PALETTE.textDark,
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                How can we help?
              </p>

              <p
                style={{
                  margin: "4px 0 0",
                  fontFamily: FONT_BODY,
                  color: "rgba(26,26,26,0.55)",
                  fontSize: 10,
                  lineHeight: 1.5,
                }}
              >
                Find quick answers about scanning products and managing your
                nutrition profile.
              </p>
            </div>

            {/* FAQ TITLE */}
            <p
              style={{
                margin: "0 0 8px 2px",
                fontFamily: FONT_HEAD,
                color: "rgba(26,26,26,0.55)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Frequently asked questions
            </p>

            {/* FAQ ITEMS */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {FAQ_ITEMS.map((item, index) => {
                const open = openQuestion === index

                return (
                  <div
                    key={item.question}
                    style={{
                      borderRadius: 13,
                      border: `1px solid rgba(224,167,46,0.28)`,
                      background: PALETTE.panel,
                      overflow: "hidden",
                      boxShadow: cardShadow,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenQuestion(open ? -1 : index)
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        width: "100%",
                        padding: "13px",
                        border: "none",
                        background: "none",
                        color: PALETTE.textDark,
                        textAlign: "left",
                        fontFamily: FONT_HEAD,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      <span>{item.question}</span>

                      <i
                        className={`fa fa-angle-${
                          open ? "up" : "down"
                        }`}
                        style={{
                          color: C.greenLight,
                          fontSize: 16,
                          flexShrink: 0,
                        }}
                      />
                    </button>

                    {open && (
                      <p
                        style={{
                          margin: 0,
                          padding: "0 13px 13px",
                          fontFamily: FONT_BODY,
                          color: "rgba(26,26,26,0.58)",
                          fontSize: 10,
                          lineHeight: 1.55,
                        }}
                      >
                        {item.answer}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>


            {/* CONTACT SUPPORT */}
            <div
              style={{
                marginTop: 18,
                padding: "14px",
                borderRadius: 13,
                border: `1px solid rgba(224,167,46,0.20)`,
                background: PALETTE.panel,
                boxShadow: cardShadow,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontFamily: FONT_HEAD,
                  color: PALETTE.textDark,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                Still need help?
              </p>

              <p
                style={{
                  margin: "4px 0 0",
                  fontFamily: FONT_BODY,
                  color: "rgba(26,26,26,0.52)",
                  fontSize: 10,
                }}
              >
                Contact us at support@scanity.app
              </p>
            </div>
          </Center>
        </div>
      </div>
    </div>
  )
}


/* =========================================================
   ABOUT
   ========================================================= */

function AboutScreen({ go }: { go: (s: Screen) => void }) {
  const isDesktop = useIsDesktop()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const features = [
    { icon: "fa-shield", title: "Personalized Safety", text: "Scanity checks products against your allergies, dietary restrictions, and health conditions." },
    { icon: "fa-barcode", title: "Smart Scanning", text: "Scan a barcode or capture a nutrition label using OCR to identify useful information." },
    { icon: "fa-leaf", title: "Nutrition Insights", text: "Get an easy-to-understand nutrition score based on important nutritional factors." },
    { icon: "fa-lightbulb-o", title: "AI Explanations", text: "Understand why a product may be safe, cautionary, or unsafe for you." },
  ]

  const steps = [
    ["01", "fa-barcode", "Scan", "Scan the product barcode or food label."],
    ["02", "fa-search", "Analyze", "Scanity analyzes ingredients and nutrition information."],
    ["03", "fa-user", "Personalize", "The system compares the product against your health profile."],
    ["04", "fa-file-text-o", "Understand", "Scanity explains potential risks and unfamiliar ingredients."],
    ["05", "fa-shield", "Decide", "Safe, caution, or avoid recommendation."],
  ]

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden", background: C.offWhite, fontFamily: FONT_BODY }}>
      <AppSidebar
        go={go}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isDesktop={isDesktop}
        active="about"
      />

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", marginLeft: isDesktop ? SIDEBAR_WIDTH : 0 }}>
        <InfoHeader
          title="About Us"
          subtitle=""
          go={go}
          showBack={false}
          onMobileMenuClick={() => setSidebarOpen(true)}
        />

        <main style={{ flex: 1, overflowY: "auto" }}>
          <section
            style={{
              position: "relative",
              minHeight: isDesktop ? 330 : 430,
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              background: C.green,
            }}
          >
            <img
              src={aboutHeroImg}
              alt="Person shopping for food in a grocery store"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
            />
            <div style={{ position: "absolute", inset: 0, background: `color-mix(in srgb, ${PALETTE.green} 68%, transparent)` }} />
            <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 1180, margin: "0 auto", padding: isDesktop ? "54px 68px" : "54px 22px" }}>
              <p style={{ margin: "0 0 14px", fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: C.textOnDark }}>About Scanity</p>
              <h1 style={{ margin: 0, maxWidth: 540, fontFamily: FONT_HEAD, fontSize: isDesktop ? 36 : 29, lineHeight: 1.1, fontWeight: 800, color: C.white }}>Making every food choice safer, simpler, and smarter.</h1>
              <p style={{ maxWidth: 480, margin: "18px 0 0", fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.88)" }}>
                Scanity is an AI-powered food safety and nutrition decision support tool that helps consumers understand food labels and determine whether packaged food products are suitable for their personal health profile.
              </p>
              <button type="button" onClick={() => go("dashboard")} style={{ marginTop: 22, display: "inline-flex", alignItems: "center", gap: 8, border: "none", borderRadius: 999, padding: "11px 17px", background: PALETTE.greenDark, color: C.white, fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                <i className="fa fa-play-circle" /> How Scanity Works <i className="fa fa-arrow-right" />
              </button>
            </div>
          </section>

          <section style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr", alignItems: "center", gap: isDesktop ? 48 : 28, padding: isDesktop ? "42px 68px 36px" : "34px 22px 36px" }}>
            <div>
              <h2 style={{ margin: 0, maxWidth: 470, fontFamily: FONT_HEAD, fontSize: isDesktop ? 25 : 22, lineHeight: 1.12, color: PALETTE.greenDark }}>Food labels shouldn't be difficult to understand.</h2>
              <p style={{ margin: "14px 0 0", maxWidth: 470, fontSize: 12.5, lineHeight: 1.65, color: PALETTE.textMuted }}>Ingredients and nutrition facts can contain technical terms that are difficult for ordinary consumers to interpret. Scanity transforms this information into simple, understandable insights so users can make more informed food choices.</p>
            </div>
            <img src={aboutLabelImg} alt="Nutrition facts label" style={{ width: "100%", height: isDesktop ? 170 : 190, objectFit: "cover", objectPosition: "center", borderRadius: 12 }} />
          </section>

          <section style={{ background: PALETTE.greenLight, padding: isDesktop ? "28px 68px 34px" : "26px 22px 32px" }}>
            <div style={{ maxWidth: 1180, margin: "0 auto" }}>
              <h2 style={{ margin: "0 0 16px", fontFamily: FONT_HEAD, fontSize: 17, color: PALETTE.greenDark }}>How Scanity Helps</h2>
              <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(4, 1fr)" : "1fr", gap: isDesktop ? 16 : 12 }}>
                {features.map((feature) => (
                  <article key={feature.title} style={{ minHeight: isDesktop ? 150 : 0, padding: "18px 17px", borderRadius: 8, background: "rgba(255,255,255,0.72)", border: "1px solid rgba(23,107,58,0.08)" }}>
                    <div style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: PALETTE.green, color: C.white, fontSize: 18 }}><i className={`fa ${feature.icon}`} /></div>
                    <h3 style={{ margin: "12px 0 5px", fontFamily: FONT_HEAD, fontSize: 12, color: PALETTE.greenDark }}>{feature.title}</h3>
                    <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.5, color: PALETTE.textMuted }}>{feature.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section style={{ maxWidth: 1180, margin: "0 auto", padding: isDesktop ? "34px 68px 38px" : "34px 22px 40px" }}>
            <h2 style={{ margin: "0 0 20px", fontFamily: FONT_HEAD, fontSize: 17, color: PALETTE.greenDark }}>How It Works</h2>
            <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(5, 1fr)" : "1fr", gap: isDesktop ? 18 : 24 }}>
              {steps.map(([number, icon, title, text], index) => (
                <div key={title} style={{ position: "relative", textAlign: "center", padding: "0 8px" }}>
                  <span style={{ position: "absolute", top: 0, left: isDesktop ? 0 : 8, fontSize: 9, fontWeight: 700, color: PALETTE.greenMid }}>{number}</span>
                  <div style={{ width: 46, height: 46, margin: "0 auto 9px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: PALETTE.greenLight, color: C.green, fontSize: 19 }}><i className={`fa ${icon}`} /></div>
                  <h3 style={{ margin: 0, fontFamily: FONT_HEAD, fontSize: 12, color: PALETTE.greenDark }}>{title}</h3>
                  <p style={{ margin: "6px auto 0", maxWidth: 170, fontSize: 10, lineHeight: 1.5, color: PALETTE.textMuted }}>{text}</p>
                  {isDesktop && index < steps.length - 1 && <i className="fa fa-arrow-right" style={{ position: "absolute", top: 16, right: -10, color: PALETTE.greenMid, fontSize: 11 }} />}
                </div>
              ))}
            </div>
          </section>

          <section style={{ background: `linear-gradient(110deg, ${PALETTE.greenDark}, ${PALETTE.greenMid})`, color: C.white, padding: isDesktop ? "24px 68px" : "28px 22px" }}>
            <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", alignItems: "center", gap: 18 }}>
              <img src={logoImg} alt="Scanity logo" style={{ width: isDesktop ? 105 : 70, height: 80, objectFit: "contain", mixBlendMode: "screen" }} />
              <div style={{ borderLeft: "1px solid rgba(255,255,255,0.5)", paddingLeft: 18 }}>
                <p style={{ margin: 0, fontSize: 9, color: C.textOnDark }}>Our Purpose</p>
                <h2 style={{ margin: 0, fontFamily: FONT_HEAD, fontSize: isDesktop ? 18 : 16, lineHeight: 1.2 }}>We believe understanding what you eat should be simple.</h2>
                <p style={{ margin: "8px 0 0", maxWidth: 560, fontSize: 10.5, lineHeight: 1.5, color: "rgba(255,255,255,0.82)" }}>Scanity was created to help consumers better understand food labels, recognize potentially unsafe ingredients, and make food decisions based on their individual health needs.</p>
              </div>
            </div>
          </section>

          <footer style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 22px 18px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 9, color: PALETTE.textMuted }}>
            <span>Scanity &nbsp;|&nbsp; See · Know · Eat</span>
            <span>About &nbsp; | &nbsp; Privacy Policy &nbsp; | &nbsp; Terms &nbsp; | &nbsp; Contact</span>
          </footer>
        </main>
      </div>
    </div>
  )
}

function LegacyAboutScreen({ go }: { go: (s: Screen) => void }) {
  const features = [
    {
      icon: "fa-search",
      title: "Scan & Read",
      text: "Scan a barcode or capture the product label using OCR.",
    },
    {
      icon: "fa-shield",
      title: "Personalized Safety",
      text: "Ingredients are checked against your allergy and health profile.",
    },
    {
      icon: "fa-lightbulb-o",
      title: "Understand Ingredients",
      text: "Complex ingredient names are translated into plain language.",
    },
    {
      icon: "fa-bar-chart",
      title: "Health Rating",
      text: "Get an overall rating based on your personal profile.",
    },
    {
      icon: "fa-magic",
      title: "AI Explanation",
      text: "Understand why Scanity gives each recommendation.",
    },
  ]

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useIsDesktop()

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: PALETTE.page,
        fontFamily: FONT_BODY,
      }}
    >
      <AppSidebar
        go={go}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isDesktop={isDesktop}
        active="about"
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          background: PALETTE.page,
          overflow: "hidden",
          marginLeft: isDesktop ? SIDEBAR_WIDTH : 0,
        }}
      >
        <InfoHeader
          title="About"
          subtitle=""
          go={go}
          showBack={false}
          onMobileMenuClick={() => setSidebarOpen(true)}
        />

        <div
          style={{
            flex: 1,
            overflowY: "auto",
          }}
        >
          <Center
            maxWidth={isDesktop ? 1180 : undefined}
            style={{
              padding: isDesktop
                ? "32px 40px 56px"
                : "20px 16px 36px",
            }}
          >
            {/* HERO */}
            <section
              style={{
                display: "grid",
                gridTemplateColumns: isDesktop
                  ? "1fr 1fr"
                  : "1fr",
                gap: isDesktop ? 46 : 24,
                alignItems: "center",
                padding: isDesktop
                  ? "34px 0 48px"
                  : "14px 0 30px",
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 14px",
                    fontFamily: FONT_HEAD,
                    fontWeight: 800,
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: PALETTE.greenText,
                  }}
                >
                  About Scanity
                </p>

                <h1
                  style={{
                    margin: 0,
                    maxWidth: 560,
                    fontFamily: FONT_HEAD,
                    fontWeight: 800,
                    fontSize: isDesktop ? 42 : 30,
                    lineHeight: 1.08,
                    color: PALETTE.textDark,
                  }}
                >
                  Smarter choices for a safer plate.
                </h1>

                <p
                  style={{
                    margin: "18px 0 0",
                    maxWidth: 500,
                    fontFamily: FONT_BODY,
                    fontSize: isDesktop ? 15 : 13,
                    lineHeight: 1.7,
                    color: PALETTE.textMuted,
                  }}
                >
                  Scanity turns confusing food labels into clear, personal
                  guidance so you can shop with confidence.
                </p>

                {/* LOGO */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 24,
                  }}
                >
                  <img
                    src={logoImg}
                    alt="Scanity logo"
                    style={{
                      width: 44,
                      height: 44,
                      objectFit: "contain",
                    }}
                  />

                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: FONT_HEAD,
                        fontWeight: 800,
                        fontSize: 15,
                        color: PALETTE.textDark,
                      }}
                    >
                      SCAN
                      <span style={{ color: C.greenLight }}>
                        ITY
                      </span>
                    </p>

                    <p
                      style={{
                        margin: "2px 0 0",
                        fontFamily: FONT_BODY,
                        fontSize: 10,
                        color: PALETTE.textMuted,
                      }}
                    >
                      See it. Know it. Eat it.
                    </p>
                  </div>
                </div>
              </div>

              {/* HERO IMAGE */}
              <div
                style={{
                  position: "relative",
                  minHeight: isDesktop ? 310 : 220,
                  borderRadius: 24,
                  overflow: "hidden",
                  background: PALETTE.greenDark,
                  boxShadow: "0 14px 30px rgba(23,107,58,0.18)",
                }}
              >
                <img
                  src={orangeJuiceImg}
                  alt="Fresh food ready to scan"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    opacity: 0.82,
                  }}
                />

                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(135deg, rgba(18,79,42,0.18), rgba(18,79,42,0.82))",
                  }}
                />

                <div
                  style={{
                    position: "absolute",
                    left: 22,
                    bottom: 22,
                    right: 22,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontFamily: FONT_HEAD,
                      fontWeight: 800,
                      fontSize: 18,
                      color: C.white,
                    }}
                  >
                    Know what is in your food.
                  </p>

                  <p
                    style={{
                      margin: "6px 0 0",
                      fontFamily: FONT_BODY,
                      fontSize: 11,
                      color: "rgba(255,255,255,0.76)",
                    }}
                  >
                    Personalized insight, at a glance.
                  </p>
                </div>
              </div>
            </section>

            <div
              style={{
                height: 1,
                background: PALETTE.border,
              }}
            />

            {/* WHAT WE DO */}
            <section
              style={{
                display: "grid",
                gridTemplateColumns: isDesktop
                  ? "1fr 1fr"
                  : "1fr",
                gap: isDesktop ? 64 : 26,
                padding: isDesktop
                  ? "44px 0 40px"
                  : "30px 0 28px",
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 12px",
                    fontFamily: FONT_HEAD,
                    fontWeight: 800,
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: PALETTE.greenText,
                  }}
                >
                  What We Do
                </p>

                <h2
                  style={{
                    margin: 0,
                    fontFamily: FONT_HEAD,
                    fontWeight: 800,
                    fontSize: isDesktop ? 28 : 23,
                    color: PALETTE.textDark,
                  }}
                >
                  Make the label easier to understand.
                </h2>

                <p
                  style={{
                    margin: "14px 0 0",
                    fontFamily: FONT_BODY,
                    fontSize: 13,
                    lineHeight: 1.75,
                    color: PALETTE.textMuted,
                  }}
                >
                  Scan a barcode or capture a nutrition label. Scanity
                  organizes the important details, checks them against your
                  saved profile, and explains what deserves your attention.
                </p>
              </div>

              {/* FEATURES */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                {features.map((feature) => (
                  <div
                    key={feature.title}
                    style={{
                      padding: "16px 14px",
                      borderTop: `2px solid ${PALETTE.green}`,
                      background: PALETTE.panel,
                      border: `1px solid ${PALETTE.border}`,
                      borderRadius: 14,
                      boxShadow: cardShadow,
                    }}
                  >
                    <i
                      className={`fa ${feature.icon}`}
                      style={{
                        color: PALETTE.greenText,
                        fontSize: 17,
                        marginBottom: 12,
                      }}
                    />

                    <p
                      style={{
                        margin: 0,
                        fontFamily: FONT_HEAD,
                        fontWeight: 800,
                        fontSize: 11.5,
                        color: PALETTE.textDark,
                      }}
                    >
                      {feature.title}
                    </p>

                    <p
                      style={{
                        margin: "6px 0 0",
                        fontFamily: FONT_BODY,
                        fontSize: 10,
                        lineHeight: 1.5,
                        color: PALETTE.textMuted,
                      }}
                    >
                      {feature.text}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* COMPARE PRODUCTS */}
            <div
              style={{
                marginTop: 8,
                padding: "18px 18px 16px",
                borderRadius: 16,
                background: PALETTE.panel,
                border: `1px solid ${PALETTE.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                boxShadow: cardShadow,
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontFamily: FONT_HEAD,
                    fontWeight: 800,
                    fontSize: 12,
                    color: PALETTE.textDark,
                  }}
                >
                  Compare products side by side
                </p>

                <p
                  style={{
                    margin: "5px 0 0",
                    fontFamily: FONT_BODY,
                    fontSize: 11,
                    color: PALETTE.textMuted,
                  }}
                >
                  Check ingredients, nutrition, and allergy safety in one
                  place.
                </p>
              </div>

              <button
                type="button"
                onClick={() => go("productCompare")}
                style={{
                  border: "none",
                  borderRadius: 10,
                  background: PALETTE.green,
                  color: C.white,
                  fontFamily: FONT_HEAD,
                  fontWeight: 700,
                  fontSize: 11,
                  padding: "10px 14px",
                  cursor: "pointer",
                  boxShadow: "0 6px 18px rgba(23,107,58,0.18)",
                }}
              >
                Compare Products
              </button>
            </div>

            {/* WHO WE ARE */}
            <section
              style={{
                display: "grid",
                gridTemplateColumns: isDesktop
                  ? "1fr 1fr"
                  : "1fr",
                gap: isDesktop ? 64 : 26,
                borderTop: `1px solid ${PALETTE.border}`,
                padding: isDesktop
                  ? "40px 0 0"
                  : "28px 0 0",
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 12px",
                    fontFamily: FONT_HEAD,
                    fontWeight: 800,
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: PALETTE.greenText,
                  }}
                >
                  Who We Are
                </p>

                <h2
                  style={{
                    margin: 0,
                    fontFamily: FONT_HEAD,
                    fontWeight: 800,
                    fontSize: isDesktop ? 28 : 23,
                    color: PALETTE.textDark,
                  }}
                >
                  Technology with a human point of view.
                </h2>

                <p
                  style={{
                    margin: "14px 0 0",
                    fontFamily: FONT_BODY,
                    fontSize: 13,
                    lineHeight: 1.75,
                    color: PALETTE.textMuted,
                  }}
                >
                  We believe food decisions should feel informed, not
                  overwhelming. Scanity brings safety, clarity, and personal
                  context together in one calm experience.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                {[
                  "Built around your needs",
                  "Clear by design",
                  "Always learning",
                ].map((title, index) => (
                  <div
                    key={title}
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "flex-start",
                      paddingBottom: 16,
                      borderBottom:
                        index === 2
                          ? "none"
                          : `1px solid ${PALETTE.border}`,
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        flexShrink: 0,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: PALETTE.greenLight,
                        color: PALETTE.green,
                        fontFamily: FONT_HEAD,
                        fontWeight: 800,
                        fontSize: 12,
                      }}
                    >
                      {index + 1}
                    </span>

                    <div>
                      <p
                        style={{
                          margin: 0,
                          fontFamily: FONT_HEAD,
                          fontWeight: 800,
                          fontSize: 13,
                          color: PALETTE.textDark,
                        }}
                      >
                        {title}
                      </p>

                      <p
                        style={{
                          margin: "4px 0 0",
                          fontFamily: FONT_BODY,
                          fontSize: 11,
                          lineHeight: 1.55,
                          color: PALETTE.textMuted,
                        }}
                      >
                        {
                          [
                            "Your allergies and health conditions shape every insight.",
                            "Important information stays readable and easy to act on.",
                            "The experience improves as we learn what helps you shop well.",
                          ][index]
                        }
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* FOOTER */}
            <footer
              style={{
                marginTop: 38,
                paddingTop: 18,
                borderTop: `1px solid ${PALETTE.border}`,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: FONT_HEAD,
                  fontWeight: 800,
                  fontSize: 12,
                  color: PALETTE.textDark,
                }}
              >
                Your health. Your choice.
              </span>

              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 10,
                  color: PALETTE.textMuted,
                }}
              >
                Scanity · Version 1.0
              </span>
            </footer>
          </Center>
        </div>
      </div>
    </div>
  )
}


/* =========================================================
   PRIVACY POLICY / TERMS OF SERVICE
   ========================================================= */

function LegalScreen({
  go,
  kind,
}: {
  go: (s: Screen) => void
  kind: "privacy" | "terms"
}) {
  const privacy = kind === "privacy"
  const isDesktop = useIsDesktop()

  const sections = privacy
    ? [
        [
          "Information we use",
          "Scanity uses your profile preferences and product scan results to provide personalized food safety guidance.",
        ],
        [
          "How we protect your data",
          "Your information is used to support your Scanity experience and is handled with care. We do not sell your personal information.",
        ],
        [
          "Your choices",
          "You can update your profile preferences at any time or delete your account from Settings.",
        ],
      ]
    : [
        [
          "Using Scanity",
          "Scanity provides informational guidance about packaged food. Always review product labels and use your own judgment.",
        ],
        [
          "Personalized recommendations",
          "Recommendations are based on the allergies and health conditions saved in your profile. Keep them up to date.",
        ],
        [
          "Service updates",
          "Features and content may change as we improve the Scanity experience.",
        ],
      ]

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: PALETTE.page,
        overflow: "hidden",
        fontFamily: FONT_BODY,
      }}
    >
      <InfoHeader
        title={privacy ? "Privacy Policy" : "Terms of Service"}
        subtitle={
          privacy
            ? "Your information and choices"
            : "Using Scanity responsibly"
        }
        go={go}
      />

      <div
        style={{
          flex: 1,
          overflowY: "auto",
        }}
      >
        <Center
          maxWidth={isDesktop ? 1180 : undefined}
          style={{
            padding: isDesktop
              ? "24px 40px 32px"
              : "18px 12px 24px",
          }}
        >
          {/* INTRO */}
          <div
            style={{
              padding: "15px",
              marginBottom: 16,
              borderRadius: 13,
              border: `1px solid rgba(224,167,46,0.28)`,
              background: PALETTE.panel,
              boxShadow: cardShadow,
            }}
          >
            <i
              className={`fa ${
                privacy ? "fa-shield" : "fa-file-text-o"
              }`}
              style={{
                color: C.greenLight,
                fontSize: 23,
                marginBottom: 8,
              }}
            />

            <p
              style={{
                margin: 0,
                fontFamily: FONT_HEAD,
                color: PALETTE.textDark,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {privacy
                ? "Your privacy matters"
                : "A few important notes"}
            </p>

            <p
              style={{
                margin: "4px 0 0",
                fontFamily: FONT_BODY,
                color: "rgba(26,26,26,0.55)",
                fontSize: 10,
                lineHeight: 1.55,
              }}
            >
              {privacy
                ? "Here is how Scanity uses information to personalize your experience."
                : "Please read these guidelines before using Scanity."}
            </p>
          </div>

          {/* SECTION TITLE */}
          <p
            style={{
              margin: "0 0 8px 2px",
              fontFamily: FONT_HEAD,
              color: "rgba(26,26,26,0.55)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {privacy ? "Policy details" : "Terms details"}
          </p>

          {/* LEGAL SECTIONS */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 9,
            }}
          >
            {sections.map(([title, text]) => (
              <section
                key={title}
                style={{
                  padding: "14px",
                  borderRadius: 13,
                  border: `1px solid rgba(224,167,46,0.28)`,
                  background: PALETTE.panel,
                  boxShadow: cardShadow,
                }}
              >
                <p
                  style={{
                    margin: "0 0 5px",
                    fontFamily: FONT_HEAD,
                    color: PALETTE.textDark,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {title}
                </p>

                <p
                  style={{
                    margin: 0,
                    fontFamily: FONT_BODY,
                    color: "rgba(26,26,26,0.56)",
                    fontSize: 10,
                    lineHeight: 1.6,
                  }}
                >
                  {text}
                </p>
              </section>
            ))}
          </div>

          {/* LAST UPDATED */}
          <p
            style={{
              margin: "18px 0 0",
              fontFamily: FONT_BODY,
              color: "rgba(26,26,26,0.38)",
              fontSize: 9,
              textAlign: "center",
            }}
          >
            Last updated August 2026
          </p>
        </Center>
      </div>
    </div>
  )
}
function SettingsScreen({ go }: { go: (s: Screen) => void }) {
  const [notifications, setNotifications] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useIsDesktop()

  const Section = ({ title }: { title: string }) => (
    <p
      style={{
        margin: "0 0 8px 2px",
        fontFamily: FONT_HEAD,
        fontWeight: 700,
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "rgba(26,26,26,0.55)",
      }}
    >
      {title}
    </p>
  )

  const Chevron = () => (
    <i
      className="fa fa-angle-right"
      style={{
        fontSize: 18,
        color: "rgba(26,26,26,0.45)",
      }}
    />
  )

  const Row = ({
    icon,
    label,
    sub,
    right,
    onClick,
    danger = false,
  }: {
    icon: ReactNode
    label: string
    sub?: string
    right?: ReactNode
    onClick?: () => void
    danger?: boolean
  }) => {
    const Tag = onClick ? "button" : "div"

    return (
      <Tag
        {...(onClick
          ? {
              type: "button" as const,
              onClick,
            }
          : {})}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 13px",
          marginBottom: 7,
          borderRadius: 13,

          /* DELETE ACCOUNT CARD */
          border: danger
            ? "1px solid rgba(232,69,60,0.20)"
            : `1px solid ${PALETTE.border}`,

          background: danger
            ? PALETTE.dangerBg
            : PALETTE.panel,

          boxShadow: cardShadow,
          boxSizing: "border-box",
          cursor: onClick ? "pointer" : "default",
          textAlign: "left",
        }}
      >
        {/* ICON BOX */}
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,

            background: danger
              ? "rgba(232,69,60,0.10)"
              : PALETTE.greenLight,

            border: danger
              ? "1px solid rgba(232,69,60,0.20)"
              : `1px solid ${PALETTE.border}`,
          }}
        >
          {icon}
        </div>

        {/* TEXT */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 11,
              color: danger
                ? C.statusDanger
                : PALETTE.textDark,
            }}
          >
            {label}
          </p>

          {sub && (
            <p
              style={{
                margin: "2px 0 0",
                fontFamily: FONT_BODY,
                fontSize: 8,
                color: danger
                  ? "rgba(185,55,48,0.75)"
                  : "rgba(26,26,26,0.52)",
              }}
            >
              {sub}
            </p>
          )}
        </div>

        {/* RIGHT ICON */}
        {right}
      </Tag>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: PALETTE.page,
        fontFamily: FONT_BODY,
      }}
    >
      {/* SIDEBAR */}
      <AppSidebar
        go={go}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isDesktop={isDesktop}
        active="settings"
      />

      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: PALETTE.page,
          marginLeft: isDesktop ? SIDEBAR_WIDTH : 0,
        }}
      >
        {/* HEADER */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            gap: 12,
            paddingTop: isDesktop
              ? 13
              : `calc(${SAFE_TOP} + 12px)`,
            paddingLeft: isDesktop ? 20 : 16,
            paddingRight: 20,
            paddingBottom: 13,
            borderBottom: `1px solid ${PALETTE.border}`,
            background: PALETTE.panel,
            boxSizing: "border-box",
          }}
        >
          {/* MOBILE MENU */}
          {!isDesktop && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              style={{
                width: 38,
                height: 38,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 10,
                border: `1px solid ${PALETTE.border}`,
                background: "#EAF4EE",
                color: PALETTE.green,
                cursor: "pointer",
                boxShadow: "0 3px 10px rgba(23,107,58,0.08)",
                flexShrink: 0,
              }}
            >
              <svg
                width={18}
                height={14}
                viewBox="0 0 24 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <line
                  x1="0"
                  y1="1"
                  x2="24"
                  y2="1"
                />
                <line
                  x1="0"
                  y1="9"
                  x2="24"
                  y2="9"
                />
                <line
                  x1="0"
                  y1="17"
                  x2="24"
                  y2="17"
                />
              </svg>
            </button>
          )}

          {/* TITLE */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: FONT_HEAD,
                fontWeight: 800,
                fontSize: 23,
                lineHeight: 1.2,
                letterSpacing: "-0.04em",
                color: PALETTE.textDark,
              }}
            >
              Settings
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                fontFamily: FONT_BODY,
                fontSize: 12,
                color: "rgba(26,26,26,0.58)",
              }}
            >
              Customize your Scanity experience
            </p>
          </div>
        </div>

        {/* CONTENT */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            flex: 1,
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          <Center
            maxWidth={isDesktop ? 1180 : undefined}
            style={{
              padding: isDesktop
                ? "24px 40px 32px"
                : "15px 12px 25px",
            }}
          >
            {/* PREFERENCES */}
            <Section title="Preferences" />

            <Row
              icon={
                <i
                  className="fa fa-bell-o"
                  style={{
                    fontSize: 17,
                    color: PALETTE.green,
                  }}
                />
              }
              label="Notifications"
              sub="Receive updates and reminders"
              right={
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setNotifications(!notifications)
                  }}
                  aria-label={
                    notifications
                      ? "Disable notifications"
                      : "Enable notifications"
                  }
                  style={{
                    width: 42,
                    height: 24,
                    padding: 0,
                    border: "none",
                    borderRadius: 12,
                    background: notifications
                      ? PALETTE.green
                      : "rgba(26,26,26,0.20)",
                    position: "relative",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 3,
                      left: notifications ? 21 : 3,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: C.white,
                      transition: "left 0.2s",
                      boxShadow:
                        "0 2px 5px rgba(0,0,0,0.25)",
                    }}
                  />
                </button>
              }
            />

            {/* SECURITY */}
            <div style={{ marginTop: 17 }}>
              <Section title="Security" />
            </div>

            <Row
              onClick={() => go("forgotPassword")}
              icon={
                <i
                  className="fa fa-key"
                  style={{
                    fontSize: 17,
                    color: PALETTE.green,
                  }}
                />
              }
              label="Change Password"
              sub="Update your current password"
              right={<Chevron />}
            />

            {/* SUPPORT & INFO */}
            <div style={{ marginTop: 17 }}>
              <Section title="Support & Info" />
            </div>

            <Row
              icon={
                <i
                  className="fa fa-shield"
                  style={{
                    fontSize: 16,
                    color: PALETTE.green,
                  }}
                />
              }
              onClick={() => go("privacy")}
              label="Privacy Policy"
              right={<Chevron />}
            />

            <Row
              icon={
                <i
                  className="fa fa-file-text-o"
                  style={{
                    fontSize: 16,
                    color: PALETTE.green,
                  }}
                />
              }
              onClick={() => go("terms")}
              label="Terms of Service"
              right={<Chevron />}
            />

            {/* ACCOUNT */}
            <div style={{ marginTop: 17 }}>
              <Section title="Account" />
            </div>

            {/* DELETE ACCOUNT */}
            <Row
              danger
              onClick={() => go("delete")}
              icon={
                <i
                  className="fa fa-trash-o"
                  style={{
                    fontSize: 18,
                    color: C.statusDanger,
                  }}
                />
              }
              label="Delete Account"
              sub="Permanently delete your account"
              right={
                <i
                  className="fa fa-angle-right"
                  style={{
                    fontSize: 18,
                    color: "rgba(232,69,60,0.55)",
                  }}
                />
              }
            />

            <div style={{ height: 15 }} />
          </Center>
        </div>
      </div>
    </div>
  )
}

function DeleteAccountScreen({
  go,
}: {
  go: (s: Screen) => void
}) {
  const [showDeleteLoading, setShowDeleteLoading] =
    useState(false)

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: PALETTE.page,
      }}
    >
      {/* ── Back Button ─────────────────────────────────────────────────── */}
      <Tooltip
        label="Back to settings"
        wrapperStyle={{
          position: "absolute",
          top: SAFE_TOP,
          left: 18,
          zIndex: 5,
        }}
      >
        <button
          type="button"
          onClick={() => go("settings")}
          aria-label="Back to settings"
          style={{
            width: 38,
            height: 38,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 11,
            border: `1px solid ${PALETTE.border}`,
            background: PALETTE.panel,
            color: PALETTE.textDark,
            cursor: "pointer",
            boxShadow:
              "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <i
            className="fa fa-angle-left"
            style={{
              fontSize: 21,
            }}
          />
        </button>
      </Tooltip>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 22,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 330,
            padding: "30px 22px 22px",
            borderRadius: 24,
            background: PALETTE.panel,
            border: `1.5px solid ${PALETTE.border}`,
            boxShadow:
              "0 18px 50px rgba(0,0,0,0.16)",
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          {/* ── Delete Icon ─────────────────────────────────────────────── */}
          <div
            style={{
              width: 78,
              height: 78,
              margin: "0 auto 17px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              background: PALETTE.dangerBg,
              border:
                "2px solid rgba(217,74,74,0.35)",
            }}
          >
            <i
              className="fa fa-trash-o"
              style={{
                fontSize: 35,
                color: PALETTE.danger,
              }}
            />
          </div>

          {/* ── Title ──────────────────────────────────────────────────── */}
          <h2
            style={{
              margin: "0 0 8px",
              fontFamily: FONT_HEAD,
              fontWeight: 800,
              fontSize: 18,
              color: PALETTE.textDark,
            }}
          >
            Delete your account?
          </h2>

          {/* ── Description ────────────────────────────────────────────── */}
          <p
            style={{
              margin: "0 auto 19px",
              maxWidth: 255,
              fontFamily: FONT_BODY,
              fontSize: 9,
              lineHeight: "15px",
              color: "rgba(26,26,26,0.58)",
            }}
          >
            This action cannot be undone. All
            your data, scan history, and
            preferences will be permanently
            deleted.
          </p>

          {/* ── Warning ────────────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              width: "100%",
              padding: "11px 12px",
              marginBottom: 20,
              boxSizing: "border-box",
              borderRadius: 12,
              background:
                "rgba(245,197,24,0.10)",
              border:
                "1px solid rgba(245,197,24,0.20)",
              textAlign: "left",
            }}
          >
            <i
              className="fa fa-exclamation-triangle"
              style={{
                fontSize: 13,
                color: "#F5C518",
                flexShrink: 0,
              }}
            />

            <span
              style={{
                fontFamily: FONT_BODY,
                fontSize: 9,
                lineHeight: "13px",
                color: "rgba(26,26,26,0.68)",
              }}
            >
              This action cannot be undone.
            </span>
          </div>

          {/* ── Delete Button ───────────────────────────────────────────── */}
          <button
            type="button"
            disabled={showDeleteLoading}
            onClick={() => {
              setShowDeleteLoading(true)

              setTimeout(() => {
                setShowDeleteLoading(false)
                go("splash")
              }, 1800)
            }}
            style={{
              width: "100%",
              height: 43,
              marginBottom: 9,
              border: "none",
              borderRadius: 12,
              background:
                "linear-gradient(135deg, #D9534F, #B93E3A)",
              color: "#FFFFFF",
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 10,
              cursor: showDeleteLoading
                ? "not-allowed"
                : "pointer",
              boxShadow:
                "0 5px 16px rgba(217,83,79,0.24)",
              opacity: showDeleteLoading
                ? 0.7
                : 1,
            }}
          >
            Yes, Delete My Account
          </button>

          {/* ── Cancel Button ───────────────────────────────────────────── */}
          <button
            type="button"
            disabled={showDeleteLoading}
            onClick={() => go("settings")}
            style={{
              width: "100%",
              height: 43,
              border:
                `1px solid ${PALETTE.border}`,
              borderRadius: 12,
              background: PALETTE.page,
              color: PALETTE.textDark,
              fontFamily: FONT_BODY,
              fontWeight: 600,
              fontSize: 10,
              cursor: showDeleteLoading
                ? "not-allowed"
                : "pointer",
              opacity: showDeleteLoading
                ? 0.6
                : 1,
            }}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* ── Delete Loading Overlay ─────────────────────────────────────── */}
      {showDeleteLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background:
              "rgba(3,18,10,0.78)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter:
              "blur(8px)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 300,
              padding: "30px 22px 24px",
              borderRadius: 24,
              background: PALETTE.panel,
              border:
                `1.5px solid ${PALETTE.border}`,
              boxShadow:
                "0 18px 50px rgba(0,0,0,0.28)",
              textAlign: "center",
              boxSizing: "border-box",
            }}
          >
            {/* Loading Icon */}
            <div
              style={{
                width: 70,
                height: 70,
                margin: "0 auto 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                border:
                  "2px solid rgba(217,74,74,0.35)",
                background:
                  PALETTE.dangerBg,
              }}
            >
              <i
                className="fa fa-trash-o"
                style={{
                  fontSize: 29,
                  color: PALETTE.danger,
                }}
              />
            </div>

            {/* Loading Title */}
            <h2
              style={{
                margin: "0 0 7px",
                fontFamily: FONT_HEAD,
                fontWeight: 800,
                fontSize: 17,
                color: PALETTE.textDark,
              }}
            >
              Deleting Account
            </h2>

            {/* Loading Description */}
            <p
              style={{
                margin: "0 0 19px",
                fontFamily: FONT_HEAD,
                fontSize: 9,
                color: "rgba(26,26,26,0.52)",
              }}
            >
              Please wait...
            </p>

            {/* Progress Bar */}
            <div
              style={{
                width: "100%",
                height: 8,
                borderRadius: 8,
                overflow: "hidden",
                background:
                  "rgba(26,26,26,0.10)",
                border:
                  "1px solid rgba(26,26,26,0.18)",
              }}
            >
              <div
                style={{
                  width: "0%",
                  height: "100%",
                  borderRadius: 8,
                  background:
                    PALETTE.danger,
                  animation:
                    "deleteProgress 1.8s linear forwards",
                }}
              />
            </div>

            {/* Loading Message */}
            <p
              style={{
                margin: "11px 0 0",
                fontFamily: FONT_BODY,
                fontWeight: 600,
                fontSize: 8,
                color: "rgba(26,26,26,0.60)",
              }}
            >
              Please wait a moment.
            </p>
          </div>
        </div>
      )}

      {/* ── Animation ───────────────────────────────────────────────────── */}
      <style>
        {`
          @keyframes deleteProgress {
            from {
              width: 0%;
            }

            to {
              width: 100%;
            }
          }
        `}
      </style>
    </div>
  )
}

// ── Forgot Password Screen ────────────────────────────────────────────────
function ForgotPasswordScreen({
  go,
  goBack,
}: {
  go: (s: Screen) => void
  goBack: () => void
}) {
  const [email, setEmail] = useState("")
  const [pressed, setPressed] = useState(false)
  const isDesktop = useIsDesktop()

  return (
    <div
      style={{
        flex: 1,
        minHeight: "100%",
        position: "relative",
        overflow: "hidden",
        background: PALETTE.page,
        fontFamily: FONT_BODY,
      }}
    >
      {/* Background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 20% 15%, rgba(224,167,46,0.14), transparent 35%)," +
            "radial-gradient(circle at 85% 80%, rgba(23,107,58,0.08), transparent 40%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: "rgba(224,167,46,0.10)",
          filter: "blur(35px)",
          top: -60,
          right: -50,
        }}
      />

      <div
        style={{
          position: "absolute",
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: "rgba(23,107,58,0.08)",
          filter: "blur(30px)",
          bottom: -50,
          left: -50,
        }}
      />

      {/* Back Button */}
      <Tooltip
        label="Back"
        wrapperStyle={{
          position: "absolute",
          top: isDesktop ? 32 : `calc(${SAFE_TOP} + 10px)`,
          left: isDesktop ? 32 : 16,
          zIndex: 3,
        }}
      >
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          style={{
            width: isDesktop ? 42 : 38,
            height: isDesktop ? 42 : 38,
            borderRadius: isDesktop ? 12 : 10,
            border: "1px solid rgba(224,167,46,0.30)",
            background: "rgba(26,26,26,0.08)",
            color: PALETTE.textDark,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            transition: "background 0.15s ease, transform 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(26,26,26,0.14)"
            e.currentTarget.style.transform = "translateX(-2px)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(26,26,26,0.08)"
            e.currentTarget.style.transform = "translateX(0)"
          }}
        >
          <i
            className="fa fa-angle-left"
            style={{ fontSize: 24 }}
          />
        </button>
      </Tooltip>

      {/* Main Content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isDesktop ? "60px 24px" : "80px 18px 24px",
          boxSizing: "border-box",
        }}
      >
        <Center
          maxWidth={isDesktop ? 480 : 360}
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: isDesktop ? "48px 44px" : "0",
            boxSizing: "border-box",
            ...(isDesktop
              ? {
                  background: PALETTE.greenLight,
                  border: "1px solid rgba(224,167,46,0.20)",
                  borderRadius: 28,
                  boxShadow:
                    "0 24px 70px rgba(0,0,0,0.45), inset 0 1px 0 rgba(26,26,26,0.06)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                }
              : {}),
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: isDesktop ? 96 : 88,
              height: isDesktop ? 96 : 88,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(224,167,46,0.12)",
              border: "1.5px solid rgba(224,167,46,0.45)",
              boxShadow:
                "0 0 30px rgba(224,167,46,0.10), inset 0 1px rgba(26,26,26,0.08)",
              marginBottom: 22,
              flexShrink: 0,
            }}
          >
            <i
              className="fa fa-unlock-alt"
              style={{
                fontSize: isDesktop ? 41 : 38,
                color: C.greenLight,
              }}
            />
          </div>

          {/* Heading */}
          <h1
            style={{
              margin: "0 0 10px",
              fontSize: isDesktop ? 28 : 21,
              fontWeight: 800,
              color: PALETTE.textDark,
              textAlign: "center",
              fontFamily: FONT_HEAD,
            }}
          >
            Forgot Password?
          </h1>

          <p
            style={{
              margin: "0 0 30px",
              maxWidth: isDesktop ? 340 : 260,
              fontSize: isDesktop ? 13 : 10,
              lineHeight: isDesktop ? "20px" : "15px",
              color: "rgba(26,26,26,0.58)",
              textAlign: "center",
            }}
          >
            Enter your email and we'll send you a
            <br />
            code to reset your password.
          </p>

          {/* Email */}
          <div
            style={{
              width: "100%",
              maxWidth: isDesktop ? 380 : 300,
              marginBottom: 10,
            }}
          >
            <label
              style={{
                display: "block",
                marginBottom: 7,
                fontSize: isDesktop ? 12 : 10,
                fontWeight: 600,
                color: PALETTE.textDark,
              }}
            >
              Email Address
            </label>

            <div
              style={{
                height: isDesktop ? 54 : 48,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "0 16px",
                boxSizing: "border-box",
                borderRadius: 14,
                background: "rgba(26,26,26,0.08)",
                border: email
                  ? "1px solid rgba(224,167,46,0.75)"
                  : "1px solid rgba(26,26,26,0.14)",
                boxShadow: email
                  ? "0 0 15px rgba(224,167,46,0.08)"
                  : "none",
              }}
            >
              <i
                className="fa fa-envelope-o"
                style={{
                  fontSize: isDesktop ? 16 : 15,
                  color: C.greenLight,
                  flexShrink: 0,
                }}
              />

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: PALETTE.textDark,
                  fontFamily: FONT_BODY,
                  fontSize: isDesktop ? 13 : 11,
                }}
              />
            </div>
          </div>

          {/* Continue */}
          <button
            type="button"
            onMouseDown={() => setPressed(true)}
            onMouseUp={() => setPressed(false)}
            onMouseLeave={() => setPressed(false)}
            onTouchStart={() => setPressed(true)}
            onTouchEnd={() => setPressed(false)}
            onClick={() => {
              if (email.trim()) {
                go("resetPassword")
              }
            }}
            style={{
              width: "100%",
              maxWidth: isDesktop ? 380 : 300,
              height: isDesktop ? 54 : 48,
              marginTop: 14,
              border: "1px solid rgba(224,167,46,0.55)",
              borderRadius: 14,
              background: pressed
                ? C.mochaLight
                : "linear-gradient(135deg, #E0A72E 0%, #C98A1F 100%)",
              color: C.white,
              fontFamily: FONT_HEAD,
              fontSize: isDesktop ? 15 : 16,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: pressed
                ? "0 3px 10px rgba(0,0,0,0.25)"
                : "0 6px 20px rgba(224,167,46,0.22)",
              transform: pressed ? "scale(0.98)" : "scale(1)",
              transition: "all 0.12s ease",
            }}
          >
            Continue
          </button>

          {/* Login */}
          <button
            type="button"
            onClick={() => go("login")}
            style={{
              marginTop: 22,
              border: "none",
              background: "transparent",
              color: "rgba(26,26,26,0.55)",
              fontFamily: FONT_BODY,
              fontSize: isDesktop ? 12 : 10,
              cursor: "pointer",
            }}
          >
            Remember your password?{" "}
            <span
              style={{
                color: C.greenLight,
                fontWeight: 750,
              }}
            >
              Login
            </span>
          </button>

          {/* Footer */}
          <p
            style={{
              margin: isDesktop ? "32px 0 0" : "24px 0 0",
              textAlign: "center",
              fontSize: isDesktop ? 12 : 10,
              color: "rgba(26,26,26,0.35)",
            }}
          >
            Scanity • See It. Know It. Eat It.
          </p>
        </Center>
      </div>
    </div>
  )
}


// ── Reset Password Screen ─────────────────────────────────────────────────
function ResetPasswordScreen({ go }: { go: (s: Screen) => void }) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pressed, setPressed] = useState(false)
  const isDesktop = useIsDesktop()

  const passwordsMatch =
    password.length > 0 &&
    confirmPassword.length > 0 &&
    password === confirmPassword

  return (
    <div
      style={{
        flex: 1,
        minHeight: "100%",
        position: "relative",
        overflow: "hidden",
        background: PALETTE.page,
        fontFamily: FONT_BODY,
      }}
    >
      {/* Background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 20% 15%, rgba(224,167,46,0.14), transparent 35%)," +
            "radial-gradient(circle at 85% 80%, rgba(23,107,58,0.08), transparent 40%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: "rgba(224,167,46,0.10)",
          filter: "blur(35px)",
          top: -60,
          right: -50,
        }}
      />

      <div
        style={{
          position: "absolute",
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: "rgba(23,107,58,0.08)",
          filter: "blur(30px)",
          bottom: -50,
          left: -50,
        }}
      />

      {/* Back */}
      <Tooltip
        label="Back"
        wrapperStyle={{
          position: "absolute",
          top: isDesktop ? 32 : SAFE_TOP,
          left: isDesktop ? 32 : 18,
          zIndex: 3,
        }}
      >
        <button
          type="button"
          onClick={() => go("forgotPassword")}
          aria-label="Back"
          style={{
            width: isDesktop ? 42 : 38,
            height: isDesktop ? 42 : 38,
            borderRadius: 12,
            border: "1px solid rgba(224,167,46,0.30)",
            background: "rgba(26,26,26,0.08)",
            color: PALETTE.textDark,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            transition: "background 0.15s ease, transform 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(26,26,26,0.14)"
            e.currentTarget.style.transform = "translateX(-2px)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(26,26,26,0.08)"
            e.currentTarget.style.transform = "translateX(0)"
          }}
        >
          <i
            className="fa fa-angle-left"
            style={{ fontSize: 24 }}
          />
        </button>
      </Tooltip>

      {/* Main */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isDesktop ? "60px 24px" : "80px 18px 24px",
          boxSizing: "border-box",
        }}
      >
        <Center
          maxWidth={isDesktop ? 480 : 360}
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: isDesktop ? "48px 44px" : "0",
            boxSizing: "border-box",
            ...(isDesktop
              ? {
                  background: PALETTE.greenLight,
                  border: "1px solid rgba(224,167,46,0.20)",
                  borderRadius: 28,
                  boxShadow:
                    "0 24px 70px rgba(0,0,0,0.45), inset 0 1px 0 rgba(26,26,26,0.06)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                }
              : {}),
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: isDesktop ? 96 : 88,
              height: isDesktop ? 96 : 88,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(224,167,46,0.12)",
              border: "1.5px solid rgba(224,167,46,0.45)",
              boxShadow:
                "0 0 30px rgba(224,167,46,0.10), inset 0 1px rgba(26,26,26,0.08)",
              marginBottom: 22,
              flexShrink: 0,
            }}
          >
            <i
              className="fa fa-lock"
              style={{
                fontSize: isDesktop ? 41 : 38,
                color: C.greenLight,
              }}
            />
          </div>

          <h1
            style={{
              margin: "0 0 10px",
              fontSize: isDesktop ? 28 : 21,
              fontWeight: 800,
              color: PALETTE.textDark,
              textAlign: "center",
              fontFamily: FONT_HEAD,
            }}
          >
            Reset Password
          </h1>

          <p
            style={{
              margin: "0 0 30px",
              maxWidth: isDesktop ? 340 : 260,
              fontSize: isDesktop ? 13 : 10,
              lineHeight: isDesktop ? "20px" : "15px",
              color: "rgba(26,26,26,0.58)",
              textAlign: "center",
            }}
          >
            Create a new password for your account.
            <br />
            Make sure it is strong and secure.
          </p>

          {/* New Password */}
          <div
            style={{
              width: "100%",
              maxWidth: isDesktop ? 380 : 300,
              marginBottom: 14,
            }}
          >
            <label
              style={{
                display: "block",
                marginBottom: 7,
                fontSize: isDesktop ? 12 : 10,
                fontWeight: 600,
                color: PALETTE.textDark,
              }}
            >
              New Password
            </label>

            <div
              style={{
                height: isDesktop ? 54 : 48,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "0 16px",
                boxSizing: "border-box",
                borderRadius: 14,
                background: "rgba(26,26,26,0.08)",
                border: password
                  ? "1px solid rgba(224,167,46,0.75)"
                  : "1px solid rgba(26,26,26,0.14)",
                boxShadow: password
                  ? "0 0 15px rgba(224,167,46,0.08)"
                  : "none",
              }}
            >
              <i
                className="fa fa-lock"
                style={{
                  fontSize: isDesktop ? 16 : 15,
                  color: C.greenLight,
                  flexShrink: 0,
                }}
              />

              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: "100%",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: PALETTE.textDark,
                  fontFamily: FONT_BODY,
                  fontSize: isDesktop ? 13 : 11,
                }}
              />

              <Tooltip
                label={showPassword ? "Hide password" : "Show password"}
              >
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "rgba(26,26,26,0.5)",
                    cursor: "pointer",
                    padding: 2,
                    flexShrink: 0,
                  }}
                >
                  <i
                    className={
                      showPassword
                        ? "fa fa-eye-slash"
                        : "fa fa-eye"
                    }
                    style={{
                      fontSize: isDesktop ? 15 : 14,
                    }}
                  />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Confirm Password */}
          <div
            style={{
              width: "100%",
              maxWidth: isDesktop ? 380 : 300,
            }}
          >
            <label
              style={{
                display: "block",
                marginBottom: 7,
                fontSize: isDesktop ? 12 : 10,
                fontWeight: 600,
                color: PALETTE.textDark,
              }}
            >
              Confirm Password
            </label>

            <div
              style={{
                height: isDesktop ? 54 : 48,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "0 16px",
                boxSizing: "border-box",
                borderRadius: 14,
                background: "rgba(26,26,26,0.08)",
                border: confirmPassword
                  ? passwordsMatch
                    ? "1px solid rgba(224,167,46,0.75)"
                    : "1px solid rgba(220,80,80,0.65)"
                  : "1px solid rgba(26,26,26,0.14)",
                boxShadow:
                  confirmPassword && passwordsMatch
                    ? "0 0 15px rgba(224,167,46,0.08)"
                    : "none",
              }}
            >
              <i
                className="fa fa-lock"
                style={{
                  fontSize: isDesktop ? 16 : 15,
                  color: C.greenLight,
                  flexShrink: 0,
                }}
              />

              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
                placeholder="Confirm new password"
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: "100%",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: PALETTE.textDark,
                  fontFamily: FONT_BODY,
                  fontSize: isDesktop ? 13 : 11,
                }}
              />

              <Tooltip
                label={showConfirm ? "Hide password" : "Show password"}
              >
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  aria-label={
                    showConfirm ? "Hide password" : "Show password"
                  }
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "rgba(26,26,26,0.5)",
                    cursor: "pointer",
                    padding: 2,
                    flexShrink: 0,
                  }}
                >
                  <i
                    className={
                      showConfirm
                        ? "fa fa-eye-slash"
                        : "fa fa-eye"
                    }
                    style={{
                      fontSize: isDesktop ? 15 : 14,
                    }}
                  />
                </button>
              </Tooltip>
            </div>

            {confirmPassword.length > 0 && (
              <p
                style={{
                  margin: "8px 0 0 4px",
                  fontSize: isDesktop ? 10 : 8,
                  color: passwordsMatch
                    ? C.statusSafe
                    : C.statusDanger,
                }}
              >
                {passwordsMatch
                  ? "✓ Passwords match"
                  : "Passwords do not match"}
              </p>
            )}
          </div>

          {/* Continue */}
          <button
            type="button"
            disabled={!passwordsMatch}
            onMouseDown={() => setPressed(true)}
            onMouseUp={() => setPressed(false)}
            onMouseLeave={() => setPressed(false)}
            onTouchStart={() => setPressed(true)}
            onTouchEnd={() => setPressed(false)}
            onClick={() => {
              if (passwordsMatch) {
                go("confirmationPassword")
              }
            }}
            style={{
              width: "100%",
              maxWidth: isDesktop ? 380 : 300,
              height: isDesktop ? 54 : 48,
              marginTop: 22,
              border: "1px solid rgba(224,167,46,0.55)",
              borderRadius: 14,
              background: !passwordsMatch
                ? "rgba(26,26,26,0.12)"
                : pressed
                  ? C.mochaLight
                  : "linear-gradient(135deg, #E0A72E 0%, #C98A1F 100%)",
              color: !passwordsMatch
                ? "rgba(26,26,26,0.35)"
                : C.white,
              fontFamily: FONT_HEAD,
              fontSize: isDesktop ? 15 : 16,
              fontWeight: 700,
              cursor: !passwordsMatch
                ? "not-allowed"
                : "pointer",
              boxShadow: !passwordsMatch
                ? "none"
                : pressed
                  ? "0 3px 10px rgba(0,0,0,0.25)"
                  : "0 6px 20px rgba(224,167,46,0.22)",
              transform: pressed
                ? "scale(0.98)"
                : "scale(1)",
              transition: "all 0.12s ease",
            }}
          >
            Continue
          </button>

          {/* Footer */}
          <p
            style={{
              margin: isDesktop ? "32px 0 0" : "24px 0 0",
              textAlign: "center",
              fontSize: isDesktop ? 12 : 10,
              color: "rgba(26,26,26,0.35)",
            }}
          >
            Scanity • See It. Know It. Eat It.
          </p>
        </Center>
      </div>
    </div>
  )
}


// ── Confirmation Password Screen ─────────────────────────────────────────
function ConfirmationPasswordScreen({
  go,
}: {
  go: (s: Screen) => void
}) {
  const isDesktop = useIsDesktop()

  return (
    <div
      style={{
        flex: 1,
        minHeight: "100%",
        background: PALETTE.page,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isDesktop ? "60px 24px" : "30px 20px",
        boxSizing: "border-box",
        color: PALETTE.textDark,
        fontFamily: FONT_BODY,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          width: isDesktop ? 260 : 220,
          height: isDesktop ? 260 : 220,
          borderRadius: "50%",
          background: "rgba(224,167,46,0.10)",
          filter: "blur(50px)",
          top: isDesktop ? 80 : 70,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />

      {/* Secondary glow */}
      <div
        style={{
          position: "absolute",
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: "rgba(23,107,58,0.06)",
          filter: "blur(45px)",
          bottom: -50,
          right: -40,
        }}
      />

      {/* Success Icon */}
      <div
        style={{
          width: isDesktop ? 92 : 82,
          height: isDesktop ? 92 : 82,
          borderRadius: "50%",
          background: C.greenLight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 35px rgba(224,167,46,0.35)",
          position: "relative",
          zIndex: 2,
          flexShrink: 0,
        }}
      >
        <i
          className="fa fa-check"
          style={{
            fontSize: isDesktop ? 48 : 42,
            color: C.white,
          }}
        />
      </div>

      {/* Heading */}
      <h2
        style={{
          margin: isDesktop ? "24px 0 8px" : "20px 0 8px",
          textAlign: "center",
          fontSize: isDesktop ? 25 : 21,
          lineHeight: isDesktop ? "32px" : "27px",
          fontWeight: 800,
          fontFamily: FONT_HEAD,
          position: "relative",
          zIndex: 2,
        }}
      >
        Your password has been
        <br />
        reset successfully.
      </h2>

      {/* Description */}
      <p
        style={{
          margin: 0,
          textAlign: "center",
          fontSize: isDesktop ? 12 : 10,
          lineHeight: isDesktop ? "18px" : "15px",
          color: "rgba(26,26,26,0.55)",
          position: "relative",
          zIndex: 2,
        }}
      >
        You can now login using your new password.
      </p>

      {/* Button */}
      <Center
        maxWidth={460}
        style={{
          width: "100%",
          marginTop: isDesktop ? 44 : 36,
          padding: "0 20px",
          boxSizing: "border-box",
          position: "relative",
          zIndex: 2,
        }}
      >
        <button
          type="button"
          onClick={() => go("login")}
          style={{
            width: "100%",
            height: isDesktop ? 60 : 52,
            border: "none",
            borderRadius: 12,
            background: C.greenLight,
            color: C.white,
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: isDesktop ? 16 : 14,
            cursor: "pointer",
            boxShadow: "0 6px 20px rgba(224,167,46,0.22)",
            transition: "transform 0.12s ease, box-shadow 0.12s ease",
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = "scale(0.98)"
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = "scale(1)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)"
          }}
        >
          Back to Login
        </button>
      </Center>

      {/* Footer */}
      <p
        style={{
          margin: isDesktop ? "30px 0 0" : "24px 0 0",
          textAlign: "center",
          fontSize: isDesktop ? 11 : 9,
          color: "rgba(26,26,26,0.35)",
          position: "relative",
          zIndex: 2,
        }}
      >
        Scanity • See It. Know It. Eat It.
      </p>
    </div>
  )
}

const LANGUAGES = [
  {
    code: "en-US",
    label: "English (United States)",
    native: "English (United States)",
  },
  { code: "cs", label: "Čeština", native: "Czech" },
  { code: "da", label: "Dansk", native: "Danish" },
  { code: "nl-BE", label: "Nederlands (België)", native: "Dutch (Belgium)" },
  {
    code: "nl-NL",
    label: "Nederlands (Nederland)",
    native: "Dutch (The Netherlands)",
  },
  {
    code: "en-AU",
    label: "English (Australia)",
    native: "English (Australia)",
  },
  {
    code: "en-GB",
    label: "English (United Kingdom)",
    native: "English (United Kingdom)",
  },
  { code: "fi", label: "Suomi", native: "Finnish" },
  { code: "fr", label: "Français", native: "French" },
  { code: "de", label: "Deutsch", native: "German" },
  { code: "ms", label: "Bahasa Melayu", native: "Malay" },
  { code: "zh", label: "普通话", native: "Mandarin" },
  { code: "ta", label: "தமிழ்", native: "Tamil" },
  { code: "ar", label: "العربية", native: "Arabic" },
  { code: "es", label: "Español", native: "Spanish" },
  { code: "ja", label: "日本語", native: "Japanese" },
  { code: "ko", label: "한국어", native: "Korean" },
]
function LanguageScreen({ go }: { go: (s: Screen) => void }) {
  const [selected, setSelected] = useState("en-US")
  const [query, setQuery] = useState("")
  const filtered = LANGUAGES.filter(
    (l) =>
      l.label.toLowerCase().includes(query.toLowerCase()) ||
      l.native.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        height: "100%",
        overflow: "hidden",
        background: PALETTE.page,
      }}
    >
      <Center maxWidth={640} style={{ width: "100%", position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingTop: SAFE_TOP,
            paddingLeft: 20,
            paddingRight: 20,
            paddingBottom: 0,
          }}
        >
          <button
            type="button"
            onClick={() => go("settings")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke={PALETTE.textDark}
              strokeWidth="2.2"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
        <p
          style={{
            margin: "10px 20px 16px",
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: 24,
            color: PALETTE.textDark,
          }}
        >
          Language
        </p>
        <div
          style={{
            margin: "0 16px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: PALETTE.panel,
            border: "1.5px solid rgba(224,167,46,0.22)",
            borderRadius: 14,
            padding: "0 14px",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(26,26,26,0.4)"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search languages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              fontFamily: FONT_BODY,
              fontSize: 13,
              color: PALETTE.textDark,
              padding: "12px 0",
              caretColor: C.greenLight,
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(26,26,26,0.4)",
                fontSize: 16,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </Center>
      <div style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 1 }}>
        <Center maxWidth={640} style={{ padding: "0 16px 16px" }}>
        {filtered.map((lang, i) => {
          const active = selected === lang.code
          const isLast = i === filtered.length - 1
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => setSelected(lang.code)}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                padding: "14px 4px",
                background: "none",
                border: "none",
                borderBottom: isLast
                  ? "none"
                  : "1px solid rgba(224,167,46,0.1)",
                cursor: "pointer",
                textAlign: "left",
                gap: 12,
              }}
            >
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    margin: 0,
                    fontFamily: FONT_HEAD,
                    fontWeight: 700,
                    fontSize: 14,
                    color: active ? C.greenLight : PALETTE.textDark,
                  }}
                >
                  {lang.label}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontFamily: FONT_BODY,
                    fontSize: 12,
                    color: "rgba(26,26,26,0.45)",
                    marginTop: 2,
                  }}
                >
                  {lang.native}
                </p>
              </div>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: `2px solid ${
                    active ? C.greenLight : "rgba(26,26,26,0.3)"
                  }`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  background: active ? C.greenLight : "transparent",
                }}
              >
                {active && (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: PALETTE.page,
                    }}
                  />
                )}
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p
            style={{
              textAlign: "center",
              color: "rgba(26,26,26,0.35)",
              fontFamily: FONT_BODY,
              fontSize: 13,
              marginTop: 32,
            }}
          >
            No languages found
          </p>
        )}
        </Center>
      </div>
      <Center maxWidth={640} style={{ position: "relative", zIndex: 1, padding: "12px 16px 32px", width: "100%" }}>
        <button
          type="button"
          onClick={() => go("settings")}
          style={{
            width: "100%",
            padding: "15px",
            borderRadius: 16,
            border: "none",
            background: "linear-gradient(135deg, #E0A72E, #C98A1F)",
            color: PALETTE.page,
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(224,167,46,0.4)",
          }}
        >
          Save Language
        </button>
      </Center>
    </div>
  )
}
// ── Screen persistence (survive a page refresh) ────────────────────────────────
// Keeping the current screen (and the back-navigation stack) in sessionStorage
// means reloading the tab lands back on the same screen instead of bouncing to
// the splash screen. sessionStorage (not localStorage) is used on purpose: it
// clears when the tab/browser closes, so opening the app fresh later still
// starts clean.
const SCREEN_STORAGE_KEY = "scanity_screen"
const SCREEN_HISTORY_STORAGE_KEY = "scanity_screen_history"
const VALID_SCREENS: string[] = [
  "splash", "login", "register", "success", "allergies", "health", "loading",
  "allset", "dashboard", "history", "barcode", "ocr", "profile", "help",
  "about", "privacy", "terms", "settings", "delete", "forgotPassword",
  "resetPassword", "confirmationPassword", "productResult", "productCompare",
  "language",
]
function readStoredScreen(): Screen {
  if (typeof window === "undefined") return "splash"
  try {
    const saved = window.sessionStorage.getItem(SCREEN_STORAGE_KEY)
    if (saved && VALID_SCREENS.includes(saved)) {
      return saved as Screen
    }
  } catch {
    // sessionStorage unavailable (private browsing, etc.) — just start fresh
  }
  return "splash"
}
function readStoredScreenHistory(): Screen[] {
  if (typeof window === "undefined") return []
  try {
    const saved = window.sessionStorage.getItem(SCREEN_HISTORY_STORAGE_KEY)
    const parsed = saved ? JSON.parse(saved) : null
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (entry): entry is Screen =>
          typeof entry === "string" && VALID_SCREENS.includes(entry),
      )
    }
  } catch {
    // ignore malformed/inaccessible storage
  }
  return []
}
function persistScreenHistory(history: Screen[]) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(
      SCREEN_HISTORY_STORAGE_KEY,
      JSON.stringify(history),
    )
  } catch {
    // ignore
  }
}
export default function App() {
  const [screen, setScreen] = useState<Screen>(readStoredScreen)
  // Tracks where each `go()` was called from, so a screen that can be
  // reached from more than one place (like Forgot Password, opened from
  // either Login or Settings) can send the back button to wherever the
  // person actually came from instead of a single hardcoded destination.
  // Restored from sessionStorage on mount so refreshing the page keeps the
  // back button working the same way it did before the reload.
  const historyRef = useRef<Screen[]>(readStoredScreenHistory())
  useEffect(() => {
    try {
      window.sessionStorage.setItem(SCREEN_STORAGE_KEY, screen)
    } catch {
      // ignore
    }
  }, [screen])
  const go = (next: Screen) => {
    historyRef.current.push(screen)
    persistScreenHistory(historyRef.current)
    setScreen(next)
  }
  const goBack = () => {
    const previous = historyRef.current.pop()
    persistScreenHistory(historyRef.current)
    setScreen(previous ?? "dashboard")
  }
  const screenMap: Record<Screen, ReactNode> = {
    splash: <SplashScreen go={go} />,
    login: <LoginScreen go={go} />,
    register: <RegisterScreen go={go} />,
    success: <SuccessScreen go={go} />,
    allergies: <AllergiesScreen go={go} />,
    health: <HealthScreen go={go} />,
    loading: <LoadingScreen go={go} />,
    allset: <AllSetScreen go={go} />,
    dashboard: <DashboardScreen go={go} />,
    history: <ScanHistoryScreen go={go} />,
    profile: <ProfileScreen go={go} />,
    help: <HelpFaqScreen go={go} />,
    about: <AboutScreen go={go} />,
    privacy: <LegalScreen go={go} kind="privacy" />,
    terms: <LegalScreen go={go} kind="terms" />,
    barcode: <BarcodeScannerScreen go={go} />,
    ocr: <OCRScannerScreen go={go} />,
    settings: <SettingsScreen go={go} />,
    delete: <DeleteAccountScreen go={go} />,
    forgotPassword: <ForgotPasswordScreen go={go} goBack={goBack} />,
    resetPassword: <ResetPasswordScreen go={go} />,
    confirmationPassword: <ConfirmationPasswordScreen go={go} />,
    productResult: <ProductResultScreen go={go} />,
    productCompare: <ProductCompareScreen go={go} goBack={goBack} />,
  }
  return <AppFrame>{screenMap[screen]}</AppFrame>
}