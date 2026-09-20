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
import orangeJuiceImg from "@/imports/orange_juice_scanity.jpeg"
import aboutHeroImg from "@/imports/bgs.png"
import aboutLabelImg from "@/imports/bgss.png"

import { askAiAboutProduct, explainIngredientWithAi, requestSafetyReport, type AiChatMessage } from "./api/ai"
import { loginUser, registerUser, wakeApi, requireApiBaseUrl } from "./api/auth"
import { lookupBarcodeProduct } from "./api/scan"
import { analyzeOcrText, extractOcrImage } from "./api/ocr"
import {
  allergyCategoriesForApi,
  conditionsForApi,
  loadHealthProfile,
  persistHealthProfile,
  saveHealthProfile,
  syncHealthProfileFromServer,
} from "./api/healthProfile"
import {
  appendScanHistory,
  historyDateLabel,
  historyTimeLabel,
  loadActiveScan,
  loadScanHistory,
  markScanFavorite,
  removeScanFromHistory,
  restoreScanToHistory,
  saveActiveScan,
  scoreFromVerdict,
  storedScanFromAnalysis,
  type AllergySignal,
  type IngredientKnowledge,
  type LabelInsight,
  type StoredScan,
} from "./api/scanHistory"
import {
  clearSessionUser,
  firstName,
  formatJoinedLabel,
  getAccessToken,
  loadProfileAvatar,
  loadSessionUser,
  saveProfileAvatar,
  saveSessionUser,
  sessionUserFromLogin,
  sessionUserFromRegister,
} from "./api/session"

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
  | "changePassword"
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
    clearSessionUser()

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
  const isDesktop = useIsDesktop()

  return (
    <div
      style={{
        flex: 1,
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: SOFT_SLATE.bg,
        fontFamily: SOFT_SLATE.fontFamily,
        color: SOFT_SLATE.textPrimary,
        boxSizing: "border-box",
        padding: isDesktop ? "36px 24px" : "24px 24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: isDesktop ? 440 : 360,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 168,
            height: 168,
            borderRadius: "50%",
            background: SOFT_SLATE.bg,
            boxShadow: SOFT_SLATE.raisedLg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 28,
          }}
        >
          <img
            src={logoImg}
            alt="Scanity logo"
            style={{
              width: 108,
              height: 108,
              objectFit: "contain",
            }}
          />
        </div>

        <h1
          style={{
            fontWeight: 800,
            fontSize: isDesktop ? 34 : 30,
            letterSpacing: "-0.01em",
            lineHeight: 1,
            margin: 0,
            textAlign: "center",
          }}
        >
          <span style={{ color: SOFT_SLATE.textPrimary }}>Scan</span>
          <span style={{ color: SOFT_SLATE.green }}>ity</span>
        </h1>
        <p
          style={{
            fontSize: 12,
            color: SOFT_SLATE.gold,
            marginTop: 10,
            marginBottom: 0,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          See · Know · Eat
        </p>

        <p
          style={{
            fontSize: 14,
            color: SOFT_SLATE.textSecondary,
            lineHeight: 1.65,
            textAlign: "center",
            fontWeight: 500,
            marginTop: 22,
            marginBottom: 36,
          }}
        >
          Your personal{" "}
          <span style={{ color: SOFT_SLATE.green, fontWeight: 700 }}>nutrition</span> &{" "}
          <span style={{ color: SOFT_SLATE.green, fontWeight: 700 }}>
            allergy safety
          </span>{" "}
          companion. Scan ingredients, understand what's in your food, and
          instantly know if it fits your dietary needs.
        </p>

        <button
          type="button"
          onClick={() => go("login")}
          style={{
            width: "100%",
            padding: 15,
            border: "none",
            borderRadius: 999,
            background: `linear-gradient(135deg, ${SOFT_SLATE.green} 0%, ${C.greenDark} 100%)`,
            color: "#ffffff",
            fontFamily: SOFT_SLATE.fontFamily,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.03em",
            boxShadow: SOFT_SLATE.raisedBtn,
            cursor: "pointer",
          }}
        >
          GET STARTED
        </button>

        <p
          style={{
            textAlign: "center",
            marginTop: 16,
            marginBottom: 0,
            fontSize: 12,
            color: SOFT_SLATE.textSecondary,
          }}
        >
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => go("login")}
            style={{
              background: "none",
              border: "none",
              color: SOFT_SLATE.green,
              fontFamily: SOFT_SLATE.fontFamily,
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Sign In
          </button>
        </p>
      </div>
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
  const [showPassword, setShowPassword] = useState(false)

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
      const result = await loginUser({
        identifier: email.trim(),
        password,
      })
      saveSessionUser(
        sessionUserFromLogin(result?.access_token, email.trim()),
      )
      try {
        const remote = await syncHealthProfileFromServer()
        const hasRemote =
          remote.allergies.length > 0 ||
          remote.conditions.length > 0 ||
          Boolean(remote.otherAllergy?.trim()) ||
          Boolean(remote.otherCondition?.trim())
        if (!hasRemote) {
          const local = loadHealthProfile()
          const hasLocal =
            local.allergies.length > 0 ||
            local.conditions.length > 0 ||
            Boolean(local.otherAllergy?.trim()) ||
            Boolean(local.otherCondition?.trim())
          if (hasLocal) await persistHealthProfile(local)
        }
      } catch (profileError) {
        console.warn("Health profile sync skipped:", profileError)
      }

      // Only navigate after the API confirms successful login.
      go("dashboard")
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "AUTH_API_NOT_READY" ||
          error.message === "AUTH_API_UNREACHABLE")
      ) {
        setLoginError(
          "Our login server is waking up or temporarily unavailable. Wait a few seconds and try again.",
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

  useEffect(() => {
    void wakeApi(8_000)
  }, [])

  return (
    <div
      style={{
        flex: 1,
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: SOFT_SLATE.bg,
        fontFamily: SOFT_SLATE.fontFamily,
        color: SOFT_SLATE.textPrimary,
        boxSizing: "border-box",
        padding: isDesktop ? "44px 28px" : "32px 24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: isDesktop ? 420 : 360,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 22,
          }}
        >
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: "50%",
              background: SOFT_SLATE.bg,
              boxShadow: SOFT_SLATE.raisedMd,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <img
              src={logoImg}
              alt="Scanity logo"
              style={{ width: 56, height: 56, objectFit: "contain" }}
            />
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em" }}>
            <span style={{ color: SOFT_SLATE.textPrimary }}>Scan</span>
            <span style={{ color: SOFT_SLATE.green }}>ity</span>
          </div>
          <h2 style={{ margin: "10px 0 0", fontSize: isDesktop ? 23 : 21, fontWeight: 800, textAlign: "center", color: SOFT_SLATE.textPrimary }}>
            Welcome Back!
          </h2>
          <p style={{ margin: "5px 0 0", fontSize: 12, color: SOFT_SLATE.textSecondary, textAlign: "center" }}>
            Please login to continue
          </p>
        </div>

        <div>
          <label htmlFor="login-email" className="sr-only">
            Email or username
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: SOFT_SLATE.bg,
              borderRadius: 999,
              padding: "12px 18px",
              boxShadow: SOFT_SLATE.raisedSm,
              marginBottom: 16,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <input
              id="login-email"
              type="text"
              placeholder="Email or username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) setEmailError("")
                if (loginError) setLoginError("")
              }}
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 13,
                color: SOFT_SLATE.textPrimary,
                flex: 1,
                minWidth: 0,
              }}
            />
          </div>
          {emailError && (
            <p style={{ margin: "0 0 8px 18px", color: C.statusDanger, fontFamily: FONT_BODY, fontSize: 11, fontWeight: 500 }}>
              {emailError}
            </p>
          )}

          <label htmlFor="login-password" className="sr-only">
            Password
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: SOFT_SLATE.bg,
              borderRadius: 999,
              padding: "12px 18px",
              boxShadow: SOFT_SLATE.raisedSm,
              marginBottom: 16,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (passwordError) setPasswordError("")
                if (loginError) setLoginError("")
              }}
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 13,
                color: SOFT_SLATE.textPrimary,
                flex: 1,
                minWidth: 0,
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: SOFT_SLATE.textSecondary,
                padding: 0,
                flexShrink: 0,
              }}
            >
              {showPassword ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {passwordError && (
            <p style={{ margin: "0 0 8px 18px", color: C.statusDanger, fontFamily: FONT_BODY, fontSize: 11, fontWeight: 500 }}>
              {passwordError}
            </p>
          )}

          {loginError && (
            <div
              role="alert"
              style={{
                margin: "4px 4px 16px",
                padding: "10px 14px",
                borderRadius: 14,
                background: "#f6e3e1",
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

          <div style={{ textAlign: "right", margin: "2px 4px 20px" }}>
            <button
              type="button"
              onClick={() => go("forgotPassword")}
              style={{
                border: "none",
                background: "transparent",
                color: SOFT_SLATE.green,
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Forgot Password?
            </button>
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={isLoading}
            style={{
              width: "100%",
              padding: 15,
              border: "none",
              borderRadius: 999,
              background: `linear-gradient(135deg, ${SOFT_SLATE.green} 0%, ${C.greenDark} 100%)`,
              color: "#ffffff",
              fontFamily: SOFT_SLATE.fontFamily,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.03em",
              boxShadow: SOFT_SLATE.raisedBtn,
              cursor: isLoading ? "default" : "pointer",
              opacity: isLoading ? 0.75 : 1,
            }}
          >
            {isLoading ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ display: "block", margin: "0 auto" }}>
                <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.3)" strokeWidth="3" fill="none" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none">
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
            )}
          </button>

          <p style={{ textAlign: "center", margin: "16px 0 0", fontSize: 12, color: SOFT_SLATE.textSecondary }}>
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => {
                if (!isLoading) go("register")
              }}
              style={{
                background: "none",
                border: "none",
                color: SOFT_SLATE.green,
                fontFamily: SOFT_SLATE.fontFamily,
                fontWeight: 700,
                fontSize: 12,
                cursor: isLoading ? "default" : "pointer",
                opacity: isLoading ? 0.6 : 1,
                padding: 0,
              }}
            >
              Register
            </button>
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: isDesktop ? 30 : 22 }}>
          <div style={{ width: 40, height: 3, borderRadius: 2, background: SOFT_SLATE.green }} />
          <div style={{ width: 12, height: 3, borderRadius: 2, background: SOFT_SLATE.gold }} />
          <div style={{ width: 6, height: 3, borderRadius: 2, background: "#c7ccd2" }} />
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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

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
      const result = await registerUser({
        name: name.trim(),
        email: email.trim(),
        password,
      })
      saveSessionUser(
        sessionUserFromRegister(result, name.trim(), email.trim()),
      )

      // Only show success after the API confirms registration.
      go("success")
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "AUTH_API_NOT_READY" ||
          error.message === "AUTH_API_UNREACHABLE")
      ) {
        setRegisterError(
          "Our registration server is waking up or temporarily unavailable. Wait a few seconds and try again.",
        )
      } else if (
        error instanceof Error &&
        /already registered|already exists|duplicate|user_already_exists/i.test(
          error.message,
        )
      ) {
        setEmailError("An account with this email already exists.")
      } else {
        setRegisterError(
          "Unable to create your account. Please check your details and try again.",
        )
      }
    } finally {
      setIsLoading(false)
    }
  }

  const registerFields: {
    id: string
    label: string
    placeholder: string
    value: string
    onChange: (v: string) => void
    error: string
    isPassword?: boolean
    path: ReactNode
  }[] = [
    {
      id: "register-name",
      label: "Full name",
      placeholder: "Full name",
      value: name,
      onChange: (v) => {
        setName(v)
        if (nameError) setNameError("")
        if (registerError) setRegisterError("")
      },
      error: nameError,
      path: (
        <>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </>
      ),
    },
    {
      id: "register-email",
      label: "Email",
      placeholder: "Email",
      value: email,
      onChange: (v) => {
        setEmail(v)
        if (emailError) setEmailError("")
        if (registerError) setRegisterError("")
      },
      error: emailError,
      path: (
        <>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 6-10 7L2 6" />
        </>
      ),
    },
    {
      id: "register-password",
      label: "Password",
      placeholder: "Password",
      value: password,
      onChange: (v) => {
        setPassword(v)
        if (passwordError) setPasswordError("")
        if (confirmError) setConfirmError("")
        if (registerError) setRegisterError("")
      },
      error: passwordError,
      isPassword: true,
      path: (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      ),
    },
    {
      id: "register-confirm",
      label: "Confirm password",
      placeholder: "Confirm password",
      value: confirm,
      onChange: (v) => {
        setConfirm(v)
        if (confirmError) setConfirmError("")
        if (registerError) setRegisterError("")
      },
      error: confirmError,
      isPassword: true,
      path: (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      ),
    },
  ]

  return (
    <div
      style={{
        flex: 1,
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: SOFT_SLATE.bg,
        fontFamily: SOFT_SLATE.fontFamily,
        color: SOFT_SLATE.textPrimary,
        boxSizing: "border-box",
        padding: isDesktop ? "36px 24px" : "24px 24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: isDesktop ? 420 : 360,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: SOFT_SLATE.bg,
              boxShadow: SOFT_SLATE.raisedIconWell,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={logoImg}
              alt="Scanity logo"
              style={{ width: 42, height: 42, objectFit: "contain" }}
            />
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", marginTop: 8 }}>
            <span style={{ color: SOFT_SLATE.textPrimary }}>Scan</span>
            <span style={{ color: SOFT_SLATE.green }}>ity</span>
          </div>
          <h2 style={{ margin: "10px 0 0", fontSize: isDesktop ? 23 : 21, fontWeight: 800, textAlign: "center", color: SOFT_SLATE.textPrimary }}>
            Create Account
          </h2>
          <p style={{ margin: "5px 0 0", fontSize: 12, color: SOFT_SLATE.textSecondary, textAlign: "center" }}>
            Start your nutrition &amp; safety journey
          </p>
        </div>

        {registerFields.map((field) => {
          const showThis = field.id === "register-password" ? showPassword : showConfirm
          const setShowThis = field.id === "register-password" ? setShowPassword : setShowConfirm
          return (
            <div key={field.id}>
              <label htmlFor={field.id} className="sr-only">
                {field.label}
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: SOFT_SLATE.bg,
                  borderRadius: 999,
                  padding: "12px 18px",
                  boxShadow: SOFT_SLATE.raisedSm,
                  marginBottom: 16,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  {field.path}
                </svg>
                <input
                  id={field.id}
                  type={field.isPassword ? (showThis ? "text" : "password") : field.id === "register-email" ? "email" : "text"}
                  placeholder={field.placeholder}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  style={{
                    border: "none",
                    background: "transparent",
                    outline: "none",
                    fontFamily: SOFT_SLATE.fontFamily,
                    fontSize: 13,
                    color: SOFT_SLATE.textPrimary,
                    flex: 1,
                    minWidth: 0,
                  }}
                />
                {field.isPassword && (
                  <button
                    type="button"
                    onClick={() => setShowThis((v) => !v)}
                    aria-label={showThis ? "Hide password" : "Show password"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: SOFT_SLATE.textSecondary,
                      padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    {showThis ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                        <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              {field.error && (
                <p style={{ margin: "0 0 8px 18px", color: C.statusDanger, fontFamily: FONT_BODY, fontSize: 11, fontWeight: 500 }}>
                  {field.error}
                </p>
              )}
            </div>
          )
        })}

        <p style={{ margin: "0 0 16px 6px", fontSize: 11, color: SOFT_SLATE.textSecondary }}>
          At least 8 characters, with 1 number.
        </p>

        {registerError && (
          <div
            role="alert"
            style={{
              margin: "0 4px 16px",
              padding: "10px 14px",
              borderRadius: 14,
              background: "#f6e3e1",
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

        <button
          type="button"
          onClick={handleRegister}
          disabled={isLoading}
          style={{
            width: "100%",
            padding: 15,
            border: "none",
            borderRadius: 999,
            background: `linear-gradient(135deg, ${SOFT_SLATE.green} 0%, ${C.greenDark} 100%)`,
            color: "#ffffff",
            fontFamily: SOFT_SLATE.fontFamily,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.03em",
            boxShadow: SOFT_SLATE.raisedBtn,
            cursor: isLoading ? "default" : "pointer",
            opacity: isLoading ? 0.75 : 1,
          }}
        >
          {isLoading ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ display: "block", margin: "0 auto" }}>
              <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.3)" strokeWidth="3" fill="none" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none">
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
            "CREATE ACCOUNT"
          )}
        </button>

        <p style={{ textAlign: "center", margin: "16px 0 0", fontSize: 12, color: SOFT_SLATE.textSecondary }}>
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => {
              if (!isLoading) go("login")
            }}
            style={{
              background: "none",
              border: "none",
              color: SOFT_SLATE.green,
              fontFamily: SOFT_SLATE.fontFamily,
              fontWeight: 700,
              fontSize: 12,
              cursor: isLoading ? "default" : "pointer",
              opacity: isLoading ? 0.6 : 1,
              padding: 0,
            }}
          >
            Login
          </button>
        </p>
      </div>
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
  const existing = loadHealthProfile()
  const [selected, setSelected] = useState<Set<string>>(new Set(existing.allergies))
  const [otherText, setOtherText] = useState(existing.otherAllergy || "")
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
            onClick={() => {
              const profile = loadHealthProfile()
              const next = {
                ...profile,
                allergies: Array.from(selected),
                otherAllergy: otherText.trim(),
              }
              saveHealthProfile(next)
              void persistHealthProfile(next).catch((error) => {
                console.warn("Could not sync allergies yet:", error)
              })
              go("health")
            }}
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
  const existing = loadHealthProfile()
  const [selected, setSelected] = useState<Set<string>>(new Set(existing.conditions))
  const [otherText, setOtherText] = useState(existing.otherCondition || "")
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
            onClick={() => {
              const profile = loadHealthProfile()
              const next = {
                ...profile,
                conditions: Array.from(selected),
                otherCondition: otherText.trim(),
              }
              saveHealthProfile(next)
              void persistHealthProfile(next).catch((error) => {
                console.warn("Could not sync health conditions yet:", error)
              })
              go("loading")
            }}
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
// `favorite` flag for the Favourite filter and an `imageUrl` for the thumb - 
// nothing invented beyond that.
type ScanMethod = "Barcode" | "OCR"
type ScanRecord = {
  id?: string
  name: string
  date: string
  time: string
  score: number
  method: ScanMethod
  favorite?: boolean
  imageUrl?: string
}

function toScanRecord(scan: StoredScan): ScanRecord {
  return {
    id: scan.id,
    name: scan.name,
    date: historyDateLabel(scan.scannedAt) || "Today",
    time: historyTimeLabel(scan.scannedAt),
    score: scan.score,
    method: scan.source === "ocr" ? "OCR" : "Barcode",
    favorite: scan.favorite,
    imageUrl: scan.imageUrl,
  }
}

function loadScanRecords(): ScanRecord[] {
  return loadScanHistory().map(toScanRecord)
}

function openStoredScan(id: string | undefined, go: (s: Screen) => void) {
  const match = loadScanHistory().find((scan) => scan.id === id) || loadScanHistory()[0]
  if (match) saveActiveScan(match)
  go("productResult")
}
// Colors are the same Soft Slate status hues DashboardIconRail's logout icon
// and the Dashboard's own Scan History panel use (SOFT_SLATE.green/caution/
// unsafe), so a score reads the same way on both screens.
function scanStatusInfo(score: number): { label: string; color: string; bg: string } {
  // Matches backend safety_score bands: 0-39 Avoid, 40-69 Caution, 70-100 Safe.
  if (score >= 70) return { label: "Safe", color: SOFT_SLATE.green, bg: "#E1EBE5" }
  if (score >= 40) return { label: "Caution", color: SOFT_SLATE.caution, bg: "#F1E3D8" }
  return { label: "Avoid", color: SOFT_SLATE.unsafe, bg: "#F1DEDA" }
}
// ── "1a Grouped activity list" ───────────────────────────────────────────────
// Scan History layout: date sections, one panel per group, hairline
// dividers between rows. History is newest-first from the user's real scans,
// so the first distinct date present reads as "Today", the next as "Yesterday",
// and older dates collapse into one "Earlier" section.
function scanDateGroupLabel(date: string, dates: string[]): string {
  const index = dates.indexOf(date)
  if (index === 0) return "Today"
  if (index === 1) return "Yesterday"
  return "Earlier"
}
type ScanGroup = { label: string; showDate: boolean; scans: ScanRecord[] }
function groupScans(scans: ScanRecord[]): ScanGroup[] {
  const dates = Array.from(new Set(scans.map((scan) => scan.date)))
  const groups: ScanGroup[] = []
  for (const scan of scans) {
    const label = scanDateGroupLabel(scan.date, dates)
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
// where the section header already says which day it is - the "Earlier"
// group keeps the default of showing it. `isLast` drops the hairline
// divider for the final row in a group panel, so the panel's own bottom
// edge stays clean instead of doubling up with a divider.
function ScanRow({
  scan,
  onView,
  onDelete,
  showDate = true,
  isLast = false,
}: {
  scan: ScanRecord
  onView: () => void
  onDelete?: () => void
  showDate?: boolean
  isLast?: boolean
}) {
  const status = scanStatusInfo(scan.score)
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 8px",
        borderBottom: isLast ? "none" : "1px solid rgba(198,204,212,0.6)",
        boxSizing: "border-box",
      }}
    >
      <button
        type="button"
        onClick={onView}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
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
                fontSize: 14,
                color: SOFT_SLATE.textPrimary,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {scan.name}
            </p>
            {scan.favorite && (
              <i className="fa fa-star" aria-label="Favorite" style={{ fontSize: 10, color: SOFT_SLATE.gold, flexShrink: 0 }} />
            )}
          </div>
          <p
            style={{
              margin: "4px 0 0",
              fontFamily: SOFT_SLATE.fontFamily,
              fontSize: 11,
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
              padding: "3px 10px",
              borderRadius: 999,
              fontFamily: SOFT_SLATE.fontFamily,
              fontWeight: 700,
              fontSize: 10,
              color: status.color,
              background: status.bg,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: status.color,
                flexShrink: 0,
              }}
            />
            {status.label}
          </span>
          <p
            style={{
              margin: "6px 0 0",
              fontFamily: SOFT_SLATE.fontFamily,
              fontWeight: 800,
              fontSize: 16,
              color: status.color,
              lineHeight: 1,
            }}
          >
            {scan.score}
          </p>
        </div>
        <i
          className="fa fa-angle-right"
          aria-hidden="true"
          style={{ fontSize: 14, color: SOFT_SLATE.textMuted, flexShrink: 0, marginLeft: 2 }}
        />
      </button>
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${scan.name}`}
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            border: "none",
            background: SOFT_SLATE.bg,
            boxShadow: SOFT_SLATE.raisedSm,
            color: SOFT_SLATE.unsafe,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      )}
    </div>
  )
}
// ── Dashboard Screen ──────────────────────────────────────────────────────────
// ── Soft Slate (neumorphic) design tokens - DASHBOARD ONLY ─────────────────────
// Originally scoped to the Dashboard screen only, per the "1a Soft Slate - 
// extruded rail, raised cards" direction from the design exploration. Scan
// History now opts into the same tokens too (by request, to match Dashboard's
// shading) - every other screen still keeps the app's normal PALETTE/theme,
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
  fontFamily: `"Plus Jakarta Sans", Archivo, ${FONT_BODY}`,
}

// ── Dashboard icon rail - 80px, icon-only, own palette ──────────────────────────
// Replaces AppSidebar on the Dashboard only (per user's "dashboard only" scope
// decision). Always visible - no mobile drawer/overlay, it's slim enough to
// stay put at any width. The Scanity wordmark/tagline live in the greeting
// header instead of the rail.
// Default nav set for DashboardIconRail - Dashboard's own four links. Scan
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
  const iconSize = isDesktop ? 42 : 36
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showLogoutLoading, setShowLogoutLoading] = useState(false)

  const handleLogout = () => {
    setShowLogoutConfirm(false)
    setShowLogoutLoading(true)
    clearSessionUser()
    setTimeout(() => {
      setShowLogoutLoading(false)
      go("splash")
    }, 900)
  }

  return (
    <>
    <div
      style={{
        width: isDesktop ? 80 : "100%",
        maxWidth: "100%",
        height: isDesktop ? "100%" : 64,
        flex: "none",
        background: SOFT_SLATE.bg,
        borderRadius: isDesktop ? 26 : 20,
        padding: isDesktop ? "36px 0 6px" : "0 10px",
        display: "flex",
        flexDirection: isDesktop ? "column" : "row",
        alignItems: "center",
        justifyContent: isDesktop ? "flex-start" : "flex-start",
        gap: isDesktop ? 32 : 6,
        boxShadow: SOFT_SLATE.raisedLg,
        fontFamily: SOFT_SLATE.fontFamily,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Brand leaf mark */}
      <Tooltip label="Scanity">
        <div
          style={{
            width: iconSize,
            height: iconSize,
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
            width={isDesktop ? 19 : 16}
            height={isDesktop ? 19 : 16}
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
          gap: isDesktop ? 20 : 4,
          flex: 1,
          minWidth: 0,
          justifyContent: isDesktop ? undefined : "space-evenly",
          overflowX: isDesktop ? undefined : "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
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
                  width: iconSize,
                  height: iconSize,
                  borderRadius: 14,
                  border: "none",
                  background: isActive ? SOFT_SLATE.bg : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: isActive ? SOFT_SLATE.insetMd : "none",
                  flexShrink: 0,
                }}
              >
                <svg
                  width={isDesktop ? 17 : 15}
                  height={isDesktop ? 17 : 15}
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

      {/* Logout stays inside the rail on mobile */}
      <Tooltip label="Log out">
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          aria-label="Log out"
          style={{
            marginTop: 0,
            marginLeft: isDesktop ? 0 : 2,
            flexShrink: 0,
            width: iconSize,
            height: iconSize,
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
            width={isDesktop ? 17 : 15}
            height={isDesktop ? 17 : 15}
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

    {showLogoutConfirm && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm log out"
        onClick={() => setShowLogoutConfirm(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          background: "rgba(20,20,20,0.55)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            width: "min(360px, 100%)",
            background: SOFT_SLATE.bg,
            borderRadius: 18,
            padding: "24px 22px",
            boxShadow: SOFT_SLATE.raisedLg,
            fontFamily: SOFT_SLATE.fontFamily,
            color: SOFT_SLATE.textPrimary,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Log out?</h3>
          <p style={{ margin: "10px 0 0", fontSize: 14, color: SOFT_SLATE.textSecondary, lineHeight: 1.45 }}>
            Are you sure you want to log out of Scanity?
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(false)}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                border: "none",
                background: SOFT_SLATE.bg,
                boxShadow: SOFT_SLATE.raisedSm,
                fontWeight: 700,
                cursor: "pointer",
                color: SOFT_SLATE.textPrimary,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                border: "none",
                background: SOFT_SLATE.caution,
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    )}

    {showLogoutLoading && (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 330,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(20,20,20,0.45)",
          color: "#fff",
          fontFamily: SOFT_SLATE.fontFamily,
          fontWeight: 700,
        }}
      >
        Logging out...
      </div>
    )}
    </>
  )
}

function DashboardScreen({ go }: { go: (s: Screen) => void }) {
  const isDesktop = useIsDesktop()
  const greetingName = firstName(loadSessionUser()?.name || "")
  const [recentScans, setRecentScans] = useState<ScanRecord[]>(() => loadScanRecords())
  useEffect(() => {
    setRecentScans(loadScanRecords())
    const refresh = () => setRecentScans(loadScanRecords())
    window.addEventListener("focus", refresh)
    window.addEventListener("storage", refresh)
    window.addEventListener("scanity-history-updated", refresh)
    return () => {
      window.removeEventListener("focus", refresh)
      window.removeEventListener("storage", refresh)
      window.removeEventListener("scanity-history-updated", refresh)
    }
  }, [])

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
          content - same trick AppSidebar uses elsewhere in the app - so it
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
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: SOFT_SLATE.textMuted,
                    }}
                  >
                    Scanity
                  </div>
                  <div
                    style={{
                      fontSize: isDesktop ? 34 : 26,
                      fontWeight: 800,
                      letterSpacing: "-0.03em",
                      color: SOFT_SLATE.textPrimary,
                      marginTop: 6,
                      lineHeight: 1.1,
                    }}
                  >
                    Hello, {greetingName}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: SOFT_SLATE.textSecondary,
                      marginTop: 8,
                      maxWidth: 420,
                      lineHeight: 1.45,
                    }}
                  >
                    Scan a product to see allergy safety and nutrition quality at a glance.
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
                {/* ── Left column - scan actions ─────────────────────────── */}
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
                        <div style={{ fontSize: 13, color: SOFT_SLATE.textSecondary, marginTop: 2 }}>
                          Faster live detect - hold steady over the code.
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

                {/* ── Right column - scan history ────────────────────────── */}
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
                    {recentScans.length === 0 ? (
                      <div
                        style={{
                          padding: "22px 12px",
                          textAlign: "center",
                          fontSize: 13,
                          color: SOFT_SLATE.textMuted,
                          lineHeight: 1.5,
                        }}
                      >
                        No scans yet. Scan a barcode or nutrition label to start your history.
                      </div>
                    ) : (
                    recentScans.map((scan) => {
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
                          onClick={() => openStoredScan(scan.id, go)}
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
                    })
                    )}
                  </div>
                </div>
              </div>
            </div>
        </Center>
      </div>
    </div>
  )
}
// ── Barcode Scanner Screen - Soft Slate ─────────────────────────────────────
// Reskinned to match DashboardScreen's neumorphic "Soft Slate" direction:
// same SOFT_SLATE token set, same DashboardIconRail nav shell, raised/inset
// shadows instead of flat borders, and the same green/gold/caution/unsafe
// status vocabulary the Dashboard's scan history already uses. All scanning
// logic (camera, ZXing, backend lookup, validation) is untouched - only the
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

// Barcode rail stays compact on phones so logout never spills outside the bar.
const BARCODE_RAIL_ITEMS: { screen: Screen; label: string; path: ReactNode }[] = [
  DASHBOARD_RAIL_ITEMS[0],
  { screen: "barcode", label: "Barcode Scanner", path: BARCODE_ICON_PATH },
  DASHBOARD_RAIL_ITEMS[2],
]

// Soft-tinted status backgrounds - the exact pairs scanStatusInfo() uses on
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
    const scannedRecently = now - lastScanTimeRef.current < 900
    return sameBarcode && scannedRecently
  }

  // ── NORMALIZE BACKEND RESULT ──────────────────────────────────────────────
  const normalizeProductResult = (result: any, barcode: string): ProductResult => {
    const product = result?.product || result?.productInformation || result?.product_information || {}
    const ingredientList = Array.isArray(product?.ingredients)
      ? product.ingredients
          .map((item: { name?: string; ingredient_name?: string } | string) =>
            typeof item === "string" ? item : item?.name || item?.ingredient_name || "",
          )
          .filter(Boolean)
          .join(", ")
      : ""

    return {
      ...result,
      barcode: result?.barcode || product?.barcode || barcode,
      productInformation: result?.productInformation || result?.product_information || product,
      product: {
        ...product,
        name: product?.name || product?.product_name,
        product_name: product?.product_name || product?.name,
        brand: product?.brand,
      },
      ingredients:
        result?.ingredients ||
        product?.ingredients_text ||
        ingredientList ||
        product?.ingredients ||
        "",
      nutrition: result?.nutrition || result?.nutriments || product?.nutrition || {},
    }
  }

  // ── LOOKUP BARCODE THROUGH BACKEND ────────────────────────────────────────
  const lookupBarcode = async (barcode: string) => {
    const cleanBarcode = barcode.trim()
    try {
      const data = await lookupBarcodeProduct(
        cleanBarcode,
        allergyCategoriesForApi(),
        conditionsForApi(),
      )

      if (
        data?.found === false ||
        data?.productFound === false ||
        data?.product_found === false ||
        data?.status === "not_found"
      ) {
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
      if (!isMountedRef.current) return

      setScanStatus("processing")
      const result = await lookupBarcode(cleanBarcode)
      if (!isMountedRef.current) return

      const normalized = normalizeProductResult(result, cleanBarcode)
      setProductResult(normalized)

      try {
        const product = result?.product || {}
        const stored = storedScanFromAnalysis({
          source: "barcode",
          name: product.product_name || product.name,
          brand: product.brand,
          barcode: cleanBarcode,
          imageUrl: product.image_url,
          ingredients: product.ingredients,
          ingredientsText: product.ingredients_raw_text,
          verdict: result?.verdict,
          grade: result?.nutri_score_grade,
          explanation: result?.explanation,
          allergyFlags: result?.allergy_flags,
          allergyMatches: result?.allergy_matches,
          labelInsights: result?.label_insights,
          aiSource: result?.ai_source,
          nutrition: Object.fromEntries(
            Object.entries(product.nutrition || {}).filter(
              ([, value]) => typeof value === "number" && Number.isFinite(value),
            ),
          ) as Record<string, number | undefined>,
          safetyScore: result?.safety_score,
        })
        appendScanHistory(stored)
        localStorage.setItem("scanityLastBarcode", cleanBarcode)
      } catch (storageError) {
        console.warn("Unable to save scan result:", storageError)
      }

      setScanStatus("success")
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
      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.ITF,
      ])
      // Prefer speed over exhaustive decode - TRY_HARDER made phone scans sluggish.
      hints.set(DecodeHintType.TRY_HARDER, false)
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 80,
      })
      readerRef.current = reader

      await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            focusMode: "continuous",
          } as MediaTrackConstraints,
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
    clearSessionUser()
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
  // problem reads as unsafe (red) - same two-tier vocabulary the Dashboard
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

      {/* ── Icon rail - same shell as Dashboard/Scan History ───────────────── */}
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

// ── OCR Scanner Screen - Soft Slate (neumorphic) ────────────────────────────
// Restyled to match DashboardScreen's neumorphism: same SOFT_SLATE tokens,
// same DashboardIconRail nav (instead of AppSidebar), raised panels/buttons,
// inset wells for camera + inputs. All state, handlers, camera/OCR/product
// logic are unchanged from the original - only the render layer changed.
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
  // Mirrors BackEnd clean_ingredient_text: do not require the word
  // "Ingredients" (OCR often mangles it). Split the whole label if needed.
  const parseIngredients = (text: string) => {
    if (!text?.trim()) return []

    const headerMatch = text.match(
      /(?:ingredients?|ingredientes?|mga\s+sangkap|sangkap|composition)\s*:?\s*/i,
    )
    let ingredientText = headerMatch
      ? text.slice(headerMatch.index! + headerMatch[0].length)
      : text

    const stopWords = [
      "nutrition facts",
      "nutrition information",
      "nutritional information",
      "allergen information",
      "allergens",
      "contains:",
      "may contain",
      "serving size",
      "calories",
      "best before",
      "net wt",
      "net weight",
    ]
    const lower = ingredientText.toLowerCase()
    let cut = ingredientText.length
    for (const stopWord of stopWords) {
      const index = lower.indexOf(stopWord)
      if (index >= 0 && index < cut) cut = index
    }
    ingredientText = ingredientText.slice(0, cut)
      .replace(/\s+and\s+/gi, ", ")
      .replace(/[•·|]/g, ",")

    const seen = new Set<string>()
    return ingredientText
      .split(/[,;\n/]+/)
      .map((item) => item.replace(/[•*]/g, "").trim().replace(/^[\d.)\s%-]+/, "").trim())
      .filter((item) => {
        if (item.length < 2 || item.length > 80) return false
        if (/^[\d.,%\s]+$/.test(item)) return false
        const letters = (item.match(/[a-zA-Z]/g) || []).length
        if (letters < 2) return false
        const key = item.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 40)
  }

  const preprocessLabelImage = async (
    source: string | HTMLCanvasElement | File,
  ): Promise<HTMLCanvasElement | string> => {
    try {
      let image: CanvasImageSource | HTMLCanvasElement = source as HTMLCanvasElement
      if (source instanceof File) {
        image = await createImageBitmap(source)
      } else if (typeof source === "string") {
        image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error("Could not load the captured image."))
          img.src = source
        })
      }

      const sourceWidth =
        "videoWidth" in image
          ? (image as HTMLVideoElement).videoWidth
          : (image as HTMLImageElement).width || (image as HTMLCanvasElement).width
      const sourceHeight =
        "videoHeight" in image
          ? (image as HTMLVideoElement).videoHeight
          : (image as HTMLImageElement).height || (image as HTMLCanvasElement).height
      if (!sourceWidth || !sourceHeight) return typeof source === "string" ? source : source

      const scale = sourceWidth < 1400 ? 2 : 1.4
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(sourceWidth * scale)
      canvas.height = Math.round(sourceHeight * scale)
      const context = canvas.getContext("2d")
      if (!context) return typeof source === "string" ? source : source

      context.imageSmoothingEnabled = false
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      const data = pixels.data
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
        const boosted = gray > 150 ? 255 : gray < 110 ? 0 : (gray - 110) * (255 / 40)
        data[i] = data[i + 1] = data[i + 2] = boosted
      }
      context.putImageData(pixels, 0, 0)
      return canvas
    } catch (error) {
      console.warn("OCR preprocess failed, using the original image:", error)
      return typeof source === "string" || source instanceof HTMLCanvasElement ? source : source
    }
  }

  // ── OCR PROCESS ─────────────────────────────────────────────────────────
  const sourceToBlob = async (source: string | HTMLCanvasElement | File): Promise<Blob> => {
    if (source instanceof File) return source
    if (source instanceof HTMLCanvasElement) {
      const blob = await new Promise<Blob | null>((resolve) => source.toBlob(resolve, "image/jpeg", 0.86))
      if (blob) return blob
      throw new Error("Unable to capture the nutrition label image.")
    }
    const response = await fetch(source)
    return response.blob()
  }

  const processOCR = async (source: string | HTMLCanvasElement | File) => {
    if (processingRef.current) return
    processingRef.current = true

    try {
      setErrorMessage("")
      stopCamera()
      setScanStatus("captured")

      setScanStatus("ocrProcessing")
      let text = ""
      let parsedIngredients: string[] = []

      // Prefer on-device OCR first. RapidOCR on the free Render host is often
      // cold/unavailable and was making phone label scans feel broken.
      try {
        const prepared = await preprocessLabelImage(source)
        const worker = await createWorker("eng")
        await worker.setParameters({
          tessedit_pageseg_mode: "6",
          preserve_interword_spaces: "1",
        })
        const result = await worker.recognize(prepared)
        text = result?.data?.text?.trim() || ""
        await worker.terminate()
        parsedIngredients = parseIngredients(text)
      } catch (localError) {
        console.warn("On-device OCR failed:", localError)
      }

      if (!text || parsedIngredients.length < 2) {
        try {
          const data = await extractOcrImage(
            await sourceToBlob(source),
            allergyCategoriesForApi(),
          )
          const remoteText = data?.extracted_text || ""
          const remoteIngredients = Array.isArray(data?.parsed_ingredients)
            ? data.parsed_ingredients
            : []
          if (remoteText && remoteText.length > text.length) text = remoteText
          if (remoteIngredients.length > parsedIngredients.length) {
            parsedIngredients = remoteIngredients
          }
        } catch (apiError) {
          console.warn("RapidOCR API unavailable:", apiError)
        }
      }

      if (!text) {
        throw new Error(
          "No text was detected. Hold the label steady, fill the frame, and try again in good light.",
        )
      }

      const ingredientsFromText = parseIngredients(text)
      const merged =
        parsedIngredients.length > 0 ? parsedIngredients : ingredientsFromText

      setExtractedText(text)
      setIngredients(merged.length > 0 ? merged : [""])

      try {
        localStorage.setItem(
          "scanityOCRResult",
          JSON.stringify({
            text,
            ingredients: merged,
            source: "ocr",
            scannedAt: new Date().toISOString(),
          }),
        )
      } catch (error) {
        console.warn("Unable to save OCR result:", error)
      }

      setScanStatus("textPreview")
    } catch (error) {
      console.error("OCR processing error:", error)
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while reading the nutrition label.",
      )
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

      let finalIngredients = ingredients.map((item) => item.trim()).filter(Boolean)
      if (finalIngredients.length === 0) {
        finalIngredients = parseIngredients(extractedText)
        if (finalIngredients.length > 0) {
          setIngredients(finalIngredients)
        } else {
          setErrorMessage(
            "Add at least one ingredient from the label before continuing. You can edit the list above.",
          )
          setScanStatus("textPreview")
          return
        }
      }

      const data = await analyzeOcrText({
        extracted_text: extractedText,
        edited_ingredients: finalIngredients,
        user_allergies: allergyCategoriesForApi(),
        user_conditions: conditionsForApi(),
        product_name: "Label scan",
      })

      const stored = storedScanFromAnalysis({
        source: "ocr",
        name: data?.product_name || "Label scan",
        ingredients: data?.parsed_ingredients || finalIngredients,
        ingredientsText: data?.extracted_text || extractedText,
        verdict: data?.verdict,
        grade: data?.nutri_score_grade || data?.score,
        explanation: data?.explanation,
        allergyFlags: data?.allergy_flags,
        allergyMatches: data?.allergy_matches,
        labelInsights: data?.label_insights,
        aiSource: data?.ai_source,
        safetyScore: data?.safety_score,
      })
      appendScanHistory(stored)

      setProductName(stored.name)
      setProductFound(true)

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
    clearSessionUser()
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
                {/* Camera well - inset like the barcode reader on Dashboard */}
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

                {/* Controls - raised neumorphic squares, like the rail icons */}
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
function safetyBand(score: number): { label: string; color: string; track: string } {
  if (score >= 70) return { label: "Safe for you", color: SOFT_SLATE.green, track: "#cfe3d6" }
  if (score >= 40) return { label: "Review carefully", color: SOFT_SLATE.caution, track: "#f0dfd0" }
  return { label: "Avoid for you", color: SOFT_SLATE.unsafe, track: "#f0d5cf" }
}

function SafetySpeedGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const band = safetyBand(clamped)
  // Needle rotates from -90deg (0) to +90deg (100)
  const needleDeg = -90 + (clamped / 100) * 180

  return (
    <div
      style={{
        width: "100%",
        background: SOFT_SLATE.bg,
        borderRadius: 24,
        padding: "22px 20px 18px",
        boxShadow: SOFT_SLATE.raisedMd,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: SOFT_SLATE.textMuted }}>
            Safety score
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: SOFT_SLATE.textSecondary }}>
            How well this product fits your allergies (0-100)
          </div>
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, color: band.color, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {clamped}
        </div>
      </div>

      <div style={{ position: "relative", width: "100%", maxWidth: 280, margin: "18px auto 8px", height: 140 }}>
        <svg viewBox="0 0 200 110" width="100%" height="100%" aria-hidden="true">
          <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={band.track} strokeWidth="16" strokeLinecap="round" />
          <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={band.color} strokeWidth="16" strokeLinecap="round"
            strokeDasharray={`${(clamped / 100) * 251.2} 251.2`} />
          <g transform={`translate(100,100) rotate(${needleDeg})`}>
            <line x1="0" y1="0" x2="0" y2="-68" stroke={SOFT_SLATE.textPrimary} strokeWidth="3" strokeLinecap="round" />
            <circle cx="0" cy="0" r="6" fill={SOFT_SLATE.textPrimary} />
          </g>
        </svg>
        <div style={{ position: "absolute", left: 8, bottom: 0, fontSize: 10, fontWeight: 700, color: SOFT_SLATE.unsafe }}>0</div>
        <div style={{ position: "absolute", right: 8, bottom: 0, fontSize: 10, fontWeight: 700, color: SOFT_SLATE.green }}>100</div>
      </div>

      <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, color: band.color }}>{band.label}</div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10, fontWeight: 700, color: SOFT_SLATE.textMuted }}>
        <span>0-39 Avoid</span>
        <span>40-69 Caution</span>
        <span>70-100 Safe</span>
      </div>
    </div>
  )
}

function nutritionRows(nutrition?: Record<string, number | undefined> | null) {
  if (!nutrition) return [] as { label: string; value: string }[]
  const pairs: { key: string; label: string; suffix: string }[] = [
    { key: "energy_kcal", label: "Energy", suffix: " kcal" },
    { key: "energyKcal100g", label: "Energy", suffix: " kcal" },
    { key: "energy_kj", label: "Energy", suffix: " kJ" },
    { key: "energy-kcal_100g", label: "Energy", suffix: " kcal" },
    { key: "sugars_g", label: "Sugars", suffix: " g" },
    { key: "sugars100g", label: "Sugars", suffix: " g" },
    { key: "sugars_100g", label: "Sugars", suffix: " g" },
    { key: "sat_fat_g", label: "Sat. fat", suffix: " g" },
    { key: "saturatedFat100g", label: "Sat. fat", suffix: " g" },
    { key: "saturated-fat_100g", label: "Sat. fat", suffix: " g" },
    { key: "sodium_mg", label: "Sodium", suffix: " mg" },
    { key: "sodium100g", label: "Sodium", suffix: " g" },
    { key: "sodium_100g", label: "Sodium", suffix: " g" },
    { key: "fiber_g", label: "Fiber", suffix: " g" },
    { key: "fiber100g", label: "Fiber", suffix: " g" },
    { key: "fiber_100g", label: "Fiber", suffix: " g" },
    { key: "protein_g", label: "Protein", suffix: " g" },
    { key: "proteins100g", label: "Protein", suffix: " g" },
    { key: "proteins_100g", label: "Protein", suffix: " g" },
  ]
  const seen = new Set<string>()
  const rows: { label: string; value: string }[] = []
  for (const pair of pairs) {
    const raw = (nutrition as Record<string, unknown>)[pair.key]
    const value =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim() && !Number.isNaN(Number(raw))
          ? Number(raw)
          : null
    if (value == null || !Number.isFinite(value) || seen.has(pair.label)) continue
    seen.add(pair.label)
    rows.push({ label: pair.label, value: `${Number(value.toFixed(2))}${pair.suffix}` })
  }
  return rows
}

function ExplainThisButton({
  label = "Explain this",
  onClick,
  busy,
}: {
  label?: string
  onClick: () => void
  busy?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        border: "none",
        borderRadius: 999,
        padding: "8px 12px",
        background: SOFT_SLATE.bg,
        boxShadow: SOFT_SLATE.raisedSm,
        color: SOFT_SLATE.green,
        fontFamily: SOFT_SLATE.fontFamily,
        fontSize: 12,
        fontWeight: 700,
        cursor: busy ? "wait" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        opacity: busy ? 0.7 : 1,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M12 3v2" />
        <path d="M12 19v2" />
        <path d="M5 12H3" />
        <path d="M21 12h-2" />
        <circle cx="12" cy="12" r="5" />
      </svg>
      {busy ? "Explaining..." : label}
    </button>
  )
}

function renderCoachMarkdown(text: string): ReactNode {
  const blocks = String(text || "").trim().split(/\n{2,}/)
  if (!blocks.length) return null

  const inline = (line: string, keyPrefix: string): ReactNode[] => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return (
          <strong key={`${keyPrefix}-b-${index}`} style={{ fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
            {part.slice(2, -2)}
          </strong>
        )
      }
      return <span key={`${keyPrefix}-t-${index}`}>{part}</span>
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 16, lineHeight: 1.55, color: SOFT_SLATE.textPrimary }}>
      {blocks.map((block, blockIndex) => {
        const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean)
        if (!lines.length) return null
        const bulletLines = lines.filter((line) => /^[-*•]\s+/.test(line))
        const mostlyBullets = bulletLines.length >= 1 && bulletLines.length >= Math.ceil(lines.length * 0.5)
        if (mostlyBullets) {
          const lead = lines.filter((line) => !/^[-*•]\s+/.test(line))
          const bullets = lines.filter((line) => /^[-*•]\s+/.test(line))
          return (
            <div key={`blk-${blockIndex}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lead.map((line, lineIndex) => (
                <p key={`lead-${blockIndex}-${lineIndex}`} style={{ margin: 0, fontSize: 16, lineHeight: 1.55 }}>
                  {inline(line, `lead-${blockIndex}-${lineIndex}`)}
                </p>
              ))}
              <ul
                style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}
              >
                {bullets.map((line, lineIndex) => (
                  <li key={`li-${blockIndex}-${lineIndex}`} style={{ lineHeight: 1.5, fontSize: 15.5 }}>
                    {inline(line.replace(/^[-*•]\s+/, ""), `li-${blockIndex}-${lineIndex}`)}
                  </li>
                ))}
              </ul>
            </div>
          )
        }
        return (
          <p key={`p-${blockIndex}`} style={{ margin: 0, lineHeight: 1.55, fontSize: 16 }}>
            {lines.map((line, lineIndex) => (
              <span key={`ln-${blockIndex}-${lineIndex}`}>
                {lineIndex > 0 && <br />}
                {inline(line.replace(/^[-*•]\s+/, ""), `p-${blockIndex}-${lineIndex}`)}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

type IngredientSheetPayload = {
  name: string
  status?: string
  reason?: string
  plainExplanation?: string
  possibleEffects?: string
  affectsAllergens?: string[]
  affectsDiets?: string[]
  knowledge?: IngredientKnowledge | null
}

function FeatureFlagRow({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: SOFT_SLATE.textMuted, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {values.map((value) => (
          <span
            key={`${label}-${value}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 10px",
              borderRadius: 10,
              background: SOFT_SLATE.bg,
              boxShadow: SOFT_SLATE.insetSm,
              fontSize: 12,
              fontWeight: 700,
              color: SOFT_SLATE.textPrimary,
              textTransform: "capitalize",
            }}
          >
            {value.replaceAll("_", " ")}
          </span>
        ))}
      </div>
    </div>
  )
}

function IngredientExplainSheet({
  item,
  onClose,
  productName,
}: {
  item: IngredientSheetPayload | null
  onClose: () => void
  productName?: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [knowledge, setKnowledge] = useState<IngredientKnowledge | null | undefined>(undefined)

  useEffect(() => {
    if (!item) {
      setKnowledge(undefined)
      setError("")
      setLoading(false)
      return
    }
    const existing = item.knowledge
    const hasBody = Boolean(
      existing?.what_it_is || existing?.commonly_seen_in || existing?.possible_effects,
    )
    if (hasBody) {
      setKnowledge(existing || null)
      setError("")
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError("")
    setKnowledge(null)
    void (async () => {
      try {
        const researched = await explainIngredientWithAi({
          ingredient: item.name,
          productName,
          conditions: conditionsForApi(),
        })
        if (cancelled) return
        setKnowledge({
          title: researched.title,
          category: researched.category,
          what_it_is: researched.what_it_is,
          commonly_seen_in: researched.commonly_seen_in,
          possible_effects: researched.possible_effects,
          affects_allergens: researched.affects_allergens,
          affects_diets: researched.affects_diets,
          source: researched.source,
          aliases: researched.aliases,
        })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Could not research this ingredient.")
        setKnowledge(item.knowledge || null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [item, productName])

  if (!item) return null
  const resolved = knowledge === undefined ? item.knowledge : knowledge
  const title = resolved?.title || item.name
  const status = String(item.status || "").toLowerCase()
  const statusColor =
    status === "avoid" ? SOFT_SLATE.unsafe : status === "caution" ? SOFT_SLATE.caution : SOFT_SLATE.green

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} details`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 280,
        background: "rgba(36, 41, 47, 0.35)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          maxHeight: "78vh",
          overflowY: "auto",
          background: SOFT_SLATE.bg,
          borderRadius: 18,
          boxShadow: SOFT_SLATE.raisedLg,
          padding: "22px 20px 24px",
          fontFamily: SOFT_SLATE.fontFamily,
          color: SOFT_SLATE.textPrimary,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</h2>
            {resolved?.category ? (
              <p style={{ margin: "6px 0 0", fontSize: 13, color: SOFT_SLATE.textMuted }}>{resolved.category}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close ingredient details"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: "none",
              background: SOFT_SLATE.bg,
              boxShadow: SOFT_SLATE.raisedSm,
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              color: SOFT_SLATE.textPrimary,
            }}
          >
            ×
          </button>
        </div>

        {status && status !== "info" ? (
          <div
            style={{
              marginTop: 14,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 10,
              background: SOFT_SLATE.bg,
              boxShadow: SOFT_SLATE.insetSm,
              color: statusColor,
              fontSize: 13,
              fontWeight: 700,
              textTransform: "capitalize",
            }}
          >
            {status === "caution" ? "Flagged for review" : status}
          </div>
        ) : null}

        {loading ? (
          <p style={{ margin: "18px 0 0", fontSize: 15, color: SOFT_SLATE.textSecondary }}>
            Looking this up...
          </p>
        ) : (
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {(resolved?.what_it_is || item.plainExplanation) && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: SOFT_SLATE.textMuted, marginBottom: 6 }}>What it is</div>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55 }}>{resolved?.what_it_is || item.plainExplanation}</p>
              </div>
            )}
            {resolved?.commonly_seen_in && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: SOFT_SLATE.textMuted, marginBottom: 6 }}>Commonly seen in</div>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55 }}>{resolved.commonly_seen_in}</p>
              </div>
            )}
            {(resolved?.possible_effects || item.possibleEffects) && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: SOFT_SLATE.textMuted, marginBottom: 6 }}>If not controlled / watch-outs</div>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55 }}>{resolved?.possible_effects || item.possibleEffects}</p>
              </div>
            )}
            <FeatureFlagRow
              label="May affect allergens"
              values={resolved?.affects_allergens || item.affectsAllergens || []}
            />
            <FeatureFlagRow
              label="May affect dietary needs"
              values={resolved?.affects_diets || item.affectsDiets || []}
            />
            {item.reason && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: SOFT_SLATE.textMuted, marginBottom: 6 }}>Why Scanity showed this</div>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: SOFT_SLATE.textSecondary }}>{item.reason}</p>
              </div>
            )}
            {resolved?.source && (
              <p style={{ margin: 0, fontSize: 12, color: SOFT_SLATE.textMuted }}>Source: {resolved.source}</p>
            )}
            {error && (
              <p style={{ margin: 0, fontSize: 13, color: SOFT_SLATE.caution }}>{error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function IngredientChip({
  label,
  tone,
  onClick,
}: {
  label: string
  tone: "caution" | "avoid" | "info"
  onClick: () => void
}) {
  const color =
    tone === "avoid" ? SOFT_SLATE.unsafe : tone === "caution" ? SOFT_SLATE.caution : SOFT_SLATE.textPrimary
  const background = tone === "avoid" ? "#F1DEDA" : tone === "caution" ? "#F1E3D8" : "#dde4ec"
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Explain ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 14px",
        minHeight: 44,
        borderRadius: 12,
        border: "none",
        background,
        color,
        fontSize: 14,
        fontWeight: 700,
        fontFamily: SOFT_SLATE.fontFamily,
        cursor: "pointer",
        whiteSpace: "nowrap",
        maxWidth: "100%",
      }}
    >
      {tone === "info" ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10v6" />
          <path d="M12 7h.01" />
        </svg>
      ) : tone === "caution" ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 8l8 8" />
        </svg>
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </button>
  )
}

function AllergySignalsCard({
  signals,
  allergens,
  verdict,
  reason,
  labelInsights,
  onOpenIngredient,
}: {
  signals: AllergySignal[]
  allergens: string[]
  verdict: CompareVerdict
  reason: string
  labelInsights: LabelInsight[]
  onOpenIngredient: (item: IngredientSheetPayload) => void
}) {
  const derived: AllergySignal[] =
    signals.length > 0
      ? signals
      : allergens.map((name) => ({ name, status: "avoid" }))
  const avoidItems = derived.filter((item) => String(item.status).toLowerCase() === "avoid")
  const cautionItems = derived.filter((item) => {
    const status = String(item.status).toLowerCase()
    return status === "caution" || status === "flagged" || status === "review"
  })
  const flaggedItems = cautionItems

  return (
    <div
      style={{
        background: SOFT_SLATE.bg,
        borderRadius: 18,
        padding: "22px 20px",
        boxShadow: SOFT_SLATE.raisedSm,
        marginBottom: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>Allergy signals</h3>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: SOFT_SLATE.textSecondary, lineHeight: 1.45 }}>
          Flagged means we could not fully confirm an ingredient against your allergies yet. Avoid means it matches your saved allergies. Tap a chip for details.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ padding: "14px 14px", borderRadius: 14, boxShadow: SOFT_SLATE.insetSm }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: SOFT_SLATE.caution }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: SOFT_SLATE.textMuted }}>Flagged</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: SOFT_SLATE.caution, lineHeight: 1 }}>
            {flaggedItems.length}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: SOFT_SLATE.textSecondary }}>Needs a quick check</div>
        </div>
        <div style={{ padding: "14px 14px", borderRadius: 14, boxShadow: SOFT_SLATE.insetSm }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: SOFT_SLATE.unsafe }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: SOFT_SLATE.textMuted }}>Avoid</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: SOFT_SLATE.unsafe, lineHeight: 1 }}>
            {avoidItems.length}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: SOFT_SLATE.textSecondary }}>Matches your allergies</div>
        </div>
      </div>

      <StatusBadge verdict={verdict} reason={reason} size="lg" />

      {(flaggedItems.length > 0 || avoidItems.length > 0) ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {flaggedItems.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: SOFT_SLATE.caution, marginBottom: 8 }}>Flagged</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {flaggedItems.map((item) => (
                  <IngredientChip
                    key={`flag-${item.name}`}
                    label={item.name}
                    tone="caution"
                    onClick={() =>
                      onOpenIngredient({
                        name: item.name,
                        status: item.status,
                        reason: item.reason,
                        plainExplanation: item.plainExplanation,
                        possibleEffects: item.possibleEffects,
                        affectsAllergens: item.affectsAllergens,
                        affectsDiets: item.affectsDiets,
                        knowledge: item.knowledge,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}
          {avoidItems.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: SOFT_SLATE.unsafe, marginBottom: 8 }}>Avoid</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {avoidItems.map((item) => (
                  <IngredientChip
                    key={`avoid-${item.name}`}
                    label={item.name}
                    tone="avoid"
                    onClick={() =>
                      onOpenIngredient({
                        name: item.name,
                        status: item.status,
                        reason: item.reason,
                        plainExplanation: item.plainExplanation,
                        possibleEffects: item.possibleEffects,
                        affectsAllergens: item.affectsAllergens,
                        affectsDiets: item.affectsDiets,
                        knowledge: item.knowledge,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <AllergenList allergens={allergens} />
      )}

      {labelInsights.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: SOFT_SLATE.textMuted, marginBottom: 6 }}>
            On this label
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: SOFT_SLATE.textSecondary, lineHeight: 1.4 }}>
            Sugar, E-numbers, and other known additives — tap for plain-language details.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {labelInsights.slice(0, 10).map((insight) => (
              <IngredientChip
                key={`insight-${insight.title}`}
                label={insight.title}
                tone="info"
                onClick={() =>
                  onOpenIngredient({
                    name: insight.ingredient || insight.title,
                    status: "info",
                    possibleEffects: insight.possible_effects,
                    affectsAllergens: insight.affects_allergens,
                    affectsDiets: insight.affects_diets,
                    knowledge: {
                      title: insight.title,
                      category: insight.category,
                      what_it_is: insight.what_it_is,
                      commonly_seen_in: insight.commonly_seen_in,
                      possible_effects: insight.possible_effects,
                      affects_allergens: insight.affects_allergens,
                      affects_diets: insight.affects_diets,
                      source: insight.source,
                      aliases: insight.aliases,
                    },
                  })
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ProductResultScreen({ go }: { go: (s: Screen) => void }) {
  const isDesktop = useIsDesktop()
  const scan = loadActiveScan()
  const [saved, setSaved] = useState(Boolean(scan?.favorite))
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [chatBusy, setChatBusy] = useState(false)
  const [chatError, setChatError] = useState("")
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [reportText, setReportText] = useState("")
  const [reportBusy, setReportBusy] = useState(false)
  const [ingredientSheet, setIngredientSheet] = useState<IngredientSheetPayload | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const rawGrade = scan?.grade
  const grade: NutritionGrade | null =
    rawGrade === "a" ||
    rawGrade === "b" ||
    rawGrade === "c" ||
    rawGrade === "d" ||
    rawGrade === "e"
      ? rawGrade
      : null
  const gradeLabels: Record<NutritionGrade, string> = {
    a: "Excellent",
    b: "Good",
    c: "Fair",
    d: "Poor",
    e: "Lowest",
  }
  const verdict: CompareVerdict = (scan?.verdict as CompareVerdict) || null
  const verdictReason = scan?.explanation || "Scan a barcode or nutrition label to see a safety result."
  const allergens = scan?.allergens || []
  const allergySignals = scan?.allergySignals || []
  const labelInsights = scan?.labelInsights || []
  const productName = scan?.name || "No product scanned yet"
  const productBrand = [scan?.brand, scan?.barcode ? `Barcode ${scan.barcode}` : scan?.source === "ocr" ? "OCR label" : null]
    .filter(Boolean)
    .join(" · ") || "Scan a product to fill this page"
  const imageUrl = scan?.imageUrl
  const safetyScore = typeof scan?.score === "number" ? scan.score : scoreFromVerdict(verdict)
  const nutrients = nutritionRows(scan?.nutrition)
  const aiLive = String(scan?.aiSource || "").toLowerCase() === "gemini"
  const avoidSummary =
    allergens.length > 0
      ? `Matches your allergies: ${allergens.slice(0, 3).join(", ")}.`
      : verdict === "safe"
        ? "No saved allergy matches on this label."
        : verdict === "caution"
          ? "Some ingredients still need a quick human check."
          : "Based on your saved allergy profile."

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, chatOpen])

  const quickPrompts = [
    "Why was this flagged for me?",
    "Explain the top risk in simple words",
    "Anything I should double-check on the label?",
  ]

  const sendChat = async (raw: string) => {
    const message = raw.trim()
    if (!message || chatBusy) return
    setChatError("")
    setChatBusy(true)
    const nextHistory = [...messages, { role: "user" as const, content: message }]
    setMessages(nextHistory)
    setChatInput("")
    try {
      const reply = await askAiAboutProduct({
        message,
        scan,
        history: nextHistory,
      })
      setMessages([...nextHistory, { role: "assistant", content: reply || "I could not answer that just now." }])
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "AI assistant is unavailable right now.")
      setMessages([
        ...nextHistory,
        {
          role: "assistant",
          content:
            scan?.explanation ||
            "I could not reach the AI coach right now. The safety score and allergy signals above are still your main guide - confirm the package label.",
        },
      ])
    } finally {
      setChatBusy(false)
    }
  }

  const runSafetyReport = async (focus?: string) => {
    if (reportBusy) return
    setReportBusy(true)
    setChatError("")
    try {
      const report = await requestSafetyReport({ scan, focus })
      setReportText(report)
      setChatOpen(true)
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: report || "Safety report unavailable right now." },
      ])
    } catch (error) {
      const fallback =
        scan?.explanation ||
        "Could not build a live safety report. Use the allergy signals and safety score above, and confirm ingredients on the package."
      setReportText(fallback)
      setChatOpen(true)
      setMessages((prev) => [...prev, { role: "assistant", content: fallback }])
      setChatError(error instanceof Error ? error.message : "Safety report unavailable.")
    } finally {
      setReportBusy(false)
    }
  }

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
        color: SOFT_SLATE.textPrimary,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: isDesktop ? "28px 48px 16px" : "20px 20px 12px",
          paddingTop: `calc(${SAFE_TOP} + 10px)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, maxWidth: 900, margin: "0 auto" }}>
          <button
            type="button"
            onClick={() => go("dashboard")}
            aria-label="Back"
            style={{
              width: 46,
              height: 46,
              borderRadius: 15,
              border: "none",
              background: SOFT_SLATE.bg,
              color: SOFT_SLATE.textPrimary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: SOFT_SLATE.raisedSm,
              flexShrink: 0,
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: isDesktop ? 28 : 24, fontWeight: 800, letterSpacing: "-0.03em" }}>
              Product Result
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: SOFT_SLATE.textMuted, lineHeight: 1.4 }}>
              Personalized safety + nutrition quality
            </p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <Center maxWidth={isDesktop ? 900 : 640} style={{ padding: isDesktop ? "12px 48px 56px" : "8px 20px 40px" }}>
          <div
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              borderRadius: 26,
              background: SOFT_SLATE.bg,
              overflow: "hidden",
              boxShadow: SOFT_SLATE.raisedLg,
              marginBottom: 28,
            }}
          >
            {imageUrl ? (
              <img src={imageUrl} alt={productName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: SOFT_SLATE.textMuted, fontSize: 13 }}>
                No product photo
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, marginBottom: 26 }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: isDesktop ? 26 : 22, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2 }}>{productName}</h2>
              <p style={{ margin: "8px 0 0", fontSize: 14, color: SOFT_SLATE.textMuted, lineHeight: 1.4 }}>{productBrand}</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <GradeBadge grade={grade} size={56} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: SOFT_SLATE.textMuted }}>
                Nutri-Score
              </span>
            </div>
          </div>

          {scan?.explanation ? (
            <div
              style={{
                background: SOFT_SLATE.bg,
                borderRadius: 18,
                padding: "20px 18px",
                boxShadow: SOFT_SLATE.raisedSm,
                marginBottom: 24,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>AI explanation</h3>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: aiLive ? SOFT_SLATE.green : SOFT_SLATE.textMuted,
                    padding: "6px 10px",
                    borderRadius: 10,
                    boxShadow: SOFT_SLATE.insetSm,
                  }}
                >
                  {aiLive ? "Gemini live" : "Offline summary"}
                </span>
              </div>
              {renderCoachMarkdown(scan.explanation)}
            </div>
          ) : null}

          <div style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>
                Allergy safety for you
              </h3>
              <ExplainThisButton
                busy={reportBusy}
                onClick={() =>
                  void runSafetyReport(
                    "Explain this safety score in simple words for my allergies. Use short bullets if helpful.",
                  )
                }
              />
            </div>
            <SafetySpeedGauge score={safetyScore} />
            <p style={{ margin: "12px 0 0", fontSize: 14, color: SOFT_SLATE.textSecondary, lineHeight: 1.5 }}>
              Starts high when nothing in this product hits your saved allergies. It only drops a lot when an ingredient matches your profile.
            </p>
          </div>

          <div
            style={{
              background: SOFT_SLATE.bg,
              borderRadius: 24,
              padding: "22px 20px 18px",
              boxShadow: SOFT_SLATE.raisedSm,
              marginBottom: 26,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>
                Nutrition quality
              </h3>
              <ExplainThisButton
                busy={reportBusy}
                onClick={() =>
                  void runSafetyReport(
                    "Explain this Nutri-Score and the nutrition numbers in plain language. Remind me it is separate from allergy safety. Use short bullets if helpful.",
                  )
                }
              />
            </div>
            <GradeScale grade={grade} />
            <p style={{ margin: "16px 0 0", fontSize: 15, color: SOFT_SLATE.textSecondary, lineHeight: 1.55 }}>
              {grade
                ? `Grade ${grade.toUpperCase()} - ${gradeLabels[grade]}. Nutri-Score is general nutrition quality only; it does not change your allergy safety score.`
                : "Nutrition grade unavailable for this product. Your allergy safety score above still applies."}
            </p>
            {nutrients.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 18 }}>
                {nutrients.map((row) => (
                  <div key={row.label} style={{ padding: "14px 14px", borderRadius: 14, boxShadow: SOFT_SLATE.insetSm }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: SOFT_SLATE.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{row.label}</div>
                    <div style={{ marginTop: 6, fontSize: 16, fontWeight: 800 }}>{row.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 16, padding: "14px 14px", borderRadius: 14, boxShadow: SOFT_SLATE.insetSm, fontSize: 12.5, color: SOFT_SLATE.textMuted }}>
                No detailed nutrition numbers were included for this product in Open Food Facts.
              </div>
            )}
          </div>

          <AllergySignalsCard
            signals={allergySignals}
            allergens={allergens}
            verdict={verdict}
            reason={avoidSummary}
            labelInsights={labelInsights}
            onOpenIngredient={setIngredientSheet}
          />

          <div style={{ display: "flex", flexDirection: isDesktop ? "row" : "column", gap: 14, marginBottom: 18 }}>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              style={{
                flex: 1,
                minHeight: 54,
                border: "none",
                borderRadius: 16,
                background: SOFT_SLATE.bg,
                color: SOFT_SLATE.textPrimary,
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: SOFT_SLATE.raisedBtn,
              }}
            >
              Ask AI chat
            </button>
            <button
              type="button"
              onClick={() => {
                if (!scan) return
                markScanFavorite(scan.id, true)
                setSaved(true)
              }}
              style={{
                flex: 1,
                minHeight: 54,
                border: "none",
                borderRadius: 16,
                background: SOFT_SLATE.bg,
                color: SOFT_SLATE.green,
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: SOFT_SLATE.raisedBtn,
              }}
            >
              {saved ? "Saved" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => go("productCompare")}
              style={{
                flex: 1,
                minHeight: 54,
                border: "none",
                borderRadius: 16,
                background: SOFT_SLATE.green,
                color: "#ffffff",
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: SOFT_SLATE.raisedBtn,
              }}
            >
              Compare
            </button>
          </div>

          {reportText && !chatOpen && (
            <div style={{ marginBottom: 20, padding: 16, borderRadius: 18, boxShadow: SOFT_SLATE.insetSm, fontSize: 13.5, color: SOFT_SLATE.textPrimary }}>
              {renderCoachMarkdown(reportText)}
            </div>
          )}
        </Center>
      </div>

      {/* Floating AI chat bubble */}
      <button
        type="button"
        aria-label={chatOpen ? "Close AI chat" : "Open AI chat"}
        onClick={() => setChatOpen((open) => !open)}
        style={{
          position: "fixed",
          right: isDesktop ? 36 : 20,
          bottom: isDesktop ? 36 : 22,
          zIndex: 230,
          width: 58,
          height: 58,
          borderRadius: "50%",
          border: "none",
          background: SOFT_SLATE.green,
          color: "#fff",
          boxShadow: SOFT_SLATE.raisedBtn,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {chatOpen ? (
          <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>×</span>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
        )}
      </button>

      {chatOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="AI product assistant"
          style={{
            position: "fixed",
            right: isDesktop ? 36 : 12,
            bottom: isDesktop ? 108 : 92,
            zIndex: 240,
            width: "min(420px, calc(100vw - 24px))",
            maxHeight: "min(72vh, 640px)",
            background: SOFT_SLATE.bg,
            borderRadius: 24,
            boxShadow: "16px 16px 34px #b8bfc8, -16px -16px 34px #ffffff",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "16px 16px 12px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>AI Assistant</div>
              <div style={{ marginTop: 3, fontSize: 11.5, color: SOFT_SLATE.textMuted, lineHeight: 1.4 }}>
                Friendly coach · explains only · does not change Safe/Caution/Avoid
              </div>
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              aria-label="Close"
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: "none",
                background: SOFT_SLATE.bg,
                boxShadow: SOFT_SLATE.raisedSm,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ padding: "0 16px 10px", display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              disabled={reportBusy}
              onClick={() => void runSafetyReport("full safety overview for my allergies and health conditions")}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "8px 12px",
                background: SOFT_SLATE.bg,
                boxShadow: SOFT_SLATE.raisedSm,
                fontSize: 11.5,
                fontWeight: 700,
                color: SOFT_SLATE.green,
                cursor: "pointer",
              }}
            >
              Safety report
            </button>
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={chatBusy}
                onClick={() => void sendChat(prompt)}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "8px 12px",
                  background: SOFT_SLATE.bg,
                  boxShadow: SOFT_SLATE.raisedSm,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: SOFT_SLATE.textSecondary,
                  cursor: "pointer",
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ padding: 14, borderRadius: 16, boxShadow: SOFT_SLATE.insetSm, fontSize: 13, lineHeight: 1.5, color: SOFT_SLATE.textSecondary }}>
                Ask anything about this product for your allergies and health notes. I will keep it clear and careful - and I will not override the scan result.
              </div>
            )}
            {messages.map((item, index) => (
              <div
                key={`${item.role}-${index}`}
                style={{
                  alignSelf: item.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "92%",
                  padding: "11px 13px",
                  borderRadius: 16,
                  background: item.role === "user" ? SOFT_SLATE.green : SOFT_SLATE.bg,
                  color: item.role === "user" ? "#fff" : SOFT_SLATE.textPrimary,
                  boxShadow: item.role === "user" ? "none" : SOFT_SLATE.insetSm,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {item.role === "assistant" ? renderCoachMarkdown(item.content) : item.content}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {chatError && (
            <div style={{ padding: "0 16px 8px", fontSize: 11.5, color: SOFT_SLATE.caution }}>{chatError}</div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void sendChat(chatInput)
            }}
            style={{ padding: "10px 12px 14px", display: "flex", gap: 8 }}
          >
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask about ingredients, risks..."
              aria-label="Ask the AI assistant"
              disabled={chatBusy}
              style={{
                flex: 1,
                border: "none",
                borderRadius: 14,
                padding: "12px 14px",
                background: SOFT_SLATE.bg,
                boxShadow: SOFT_SLATE.insetSm,
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 13,
                color: SOFT_SLATE.textPrimary,
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={chatBusy || !chatInput.trim()}
              style={{
                border: "none",
                borderRadius: 14,
                padding: "0 16px",
                background: SOFT_SLATE.green,
                color: "#fff",
                fontWeight: 700,
                cursor: chatBusy ? "wait" : "pointer",
                opacity: chatBusy || !chatInput.trim() ? 0.6 : 1,
              }}
            >
              Send
            </button>
          </form>
        </div>
      )}

      <IngredientExplainSheet
        item={ingredientSheet}
        productName={productName}
        onClose={() => setIngredientSheet(null)}
      />
    </div>
  )
}

// ── Product Comparison ───────────────────────────────────────────────────────

// Nutrition Grade - a Nutri-Score-style A (best) to E (worst) letter grade
// for a product's overall ingredient/nutrition quality. It is computed from
// the product alone (nutrients, ingredients, processing) and is intentionally
// independent of any one user's saved allergies or health conditions - a
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
  // Nutrition grade (A-E) - quality only, never affected by this user's
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
        Nutrition Comparison - per 100g
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
                      ? " - "
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
                      ? " - "
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
// ── Product Compare Screen - Soft Slate Neumorphic ────────────────────────────

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
  const history = loadScanHistory()
  const [scenario, setScenario] =
    useState<CompareScenario>(history.length >= 2 ? "success-a" : "initial")


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

  const toCompareProduct = (scan: StoredScan): CompareProduct => ({
    name: scan.name,
    brand: scan.brand,
    quantity: scan.barcode || (scan.source === "ocr" ? "Label scan" : undefined),
    imageUrl: scan.imageUrl,
    grade: scan.grade,
    verdict: scan.verdict,
    verdictReason: scan.explanation,
    allergens: scan.allergens,
    ingredientsText: scan.ingredientsText,
    nutrition: scan.nutrition as CompareProduct["nutrition"],
    breakdown: null,
  })

  let a: CompareProduct = history[0]
    ? toCompareProduct(history[0])
    : {
        name: "First product",
        grade: null,
        verdict: null,
      }
  let b: CompareProduct = history[1]
    ? toCompareProduct(history[1])
    : {
        name: "Second product",
        grade: null,
        verdict: null,
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

  const compareNavItems = [
    DASHBOARD_RAIL_ITEMS[0],
    {
      screen: "productCompare" as Screen,
      label: "Compare Products",
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
    { screen: "history" as Screen, label: "Scan History", path: CLOCK_ICON_PATH },
    DASHBOARD_RAIL_ITEMS[1],
    DASHBOARD_RAIL_ITEMS[2],
    DASHBOARD_RAIL_ITEMS[3],
  ]

  const CompareLayout = ({ children }: { children: ReactNode }) => (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: SOFT_SLATE.bg,
        overflow: "hidden",
        position: "relative",
        fontFamily: SOFT_SLATE.fontFamily,
      }}
    >
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
          <DashboardIconRail
            go={go}
            isDesktop
            active="productCompare"
            navItems={compareNavItems}
          />
        </div>
      )}

      {!isDesktop && (
        <div style={{ padding: "12px 14px 0", boxSizing: "border-box" }}>
          <DashboardIconRail
            go={go}
            isDesktop={false}
            active="productCompare"
            navItems={compareNavItems}
          />
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflowY: "auto",
          marginLeft: isDesktop ? 80 + 26 + 26 : 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  )

  if (scenario === "initial" || history.length < 2) {
    return (
      <CompareLayout>
        <div
          style={{
            padding: `${isDesktop ? "40px" : "16px"} ${H_PAD}px 10px`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
        <div style={{ flex: 1, overflowY: "auto", padding: `20px ${H_PAD}px 50px` }}>
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
              <h3
                style={{
                  margin: 0,
                  fontFamily: SOFT_SLATE.fontFamily,
                  fontSize: 17,
                  fontWeight: 800,
                  color: SOFT_SLATE.textPrimary,
                }}
              >
                Scan two products first
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
                Compare uses your latest real scans. Scan a barcode or nutrition label twice, then come back here.
              </p>
              <button
                type="button"
                onClick={() => go("barcode")}
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
                Scan a product
              </button>
            </div>
          </Center>
        </div>
      </CompareLayout>
    )
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (scenario === "loading") {
    return (
      <CompareLayout>
          <div
            style={{
              padding: `${
                isDesktop ? "40px" : "16px"
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
      </CompareLayout>
    )
  }

  // ── Error / Not Found ────────────────────────────────────────────────────

  if (
    scenario === "error" ||
    scenario === "not-found"
  ) {
    const isError = scenario === "error"

    return (
      <CompareLayout>
          <div
            style={{
              padding: `${
                isDesktop
                  ? "40px"
                  : "16px"
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
                    : "We couldn't find a match for the second barcode. It may not be in the database yet - try scanning again or search by name."}
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
      </CompareLayout>
    )
  }

  // ── Main content ─────────────────────────────────────────────────────────

  const insights = buildInsights(
    a,
    b,
    recommendation
  )

  return (
    <CompareLayout>
        {/* ── Header ─────────────────────────────────────────────────────── */}

        <div
          style={{
            padding: `${
              isDesktop
                ? "40px"
                : "16px"
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
                  Nutrition Comparison - per 100g
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
                                ? " - "
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
                                ? " - "
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
                      ? " - "
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
    </CompareLayout>
  )
}

// Same data the Dashboard panel reads from - no separate placeholder set.
function ScanHistoryScreen({ go }: { go: (s: Screen) => void }) {
  const [query, setQuery] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const [recentScans, setRecentScans] = useState<ScanRecord[]>(() => loadScanRecords())
  const [undoToast, setUndoToast] = useState<{
    scan: StoredScan
    index: number
  } | null>(null)
  const undoTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setRecentScans(loadScanRecords())
    const refresh = () => setRecentScans(loadScanRecords())
    window.addEventListener("focus", refresh)
    window.addEventListener("storage", refresh)
    window.addEventListener("scanity-history-updated", refresh)
    return () => {
      window.removeEventListener("focus", refresh)
      window.removeEventListener("storage", refresh)
      window.removeEventListener("scanity-history-updated", refresh)
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    }
  }, [])

  const handleDelete = (id: string | undefined) => {
    if (!id) return
    const fullList = loadScanHistory()
    const index = fullList.findIndex((item) => item.id === id)
    const removed = removeScanFromHistory(id)
    if (!removed) return
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    setUndoToast({ scan: removed, index: index < 0 ? 0 : index })
    undoTimerRef.current = window.setTimeout(() => setUndoToast(null), 5000)
  }

  const handleUndo = () => {
    if (!undoToast) return
    restoreScanToHistory(undoToast.scan, undoToast.index)
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    setUndoToast(null)
  }

  const scans = recentScans.filter((scan) =>
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
      {/* SIDEBAR - mobile drawer only; desktop uses the Soft Slate rail below,
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

      {/* ICON RAIL - Dashboard's own rail component, reused as-is: same
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
        {/* MOBILE MENU BUTTON - the rail stands in for this on desktop */}
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
              padding: isDesktop ? "48px 40px 48px" : "24px 22px 40px",
            }}
          >
            {/* HEADER - "1a Grouped activity list" layout, Dashboard's Soft
                Slate palette. */}
            <h1
              style={{
                margin: "0 0 8px",
                color: SOFT_SLATE.textPrimary,
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 28,
                fontWeight: 800,
                lineHeight: 1.2,
              }}
            >
              Scan History
            </h1>
            <p
              style={{
                margin: "0 0 28px",
                color: SOFT_SLATE.textMuted,
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 13.5,
              }}
            >
              Everything you've scanned, newest first.
            </p>

            {/* SEARCH - inset (pressed-in) like a Soft Slate field, rather
                than the raised look used for buttons/cards. */}
            <div style={{ position: "relative", marginBottom: 28 }}>
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
                  padding: "14px 18px 14px 42px",
                  boxSizing: "border-box",
                  borderRadius: 999,
                  border: "none",
                  background: SOFT_SLATE.bg,
                  color: SOFT_SLATE.textPrimary,
                  outline: "none",
                  fontFamily: SOFT_SLATE.fontFamily,
                  fontSize: 13.5,
                  boxShadow: SOFT_SLATE.insetMd,
                }}
              />
            </div>

            {/* SCAN HISTORY - a date-section header (label + count) sits on
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
                    {query.trim()
                      ? "No scans match that search."
                      : "No scans yet. Scan a barcode or nutrition label to start your history."}
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

                    {/* GROUP PANEL - raised, borderless, same shading as the
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
                          key={`${scan.id || scan.name}-${scan.time}`}
                          scan={scan}
                          onView={() => openStoredScan(scan.id, go)}
                          onDelete={() => handleDelete(scan.id)}
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

      {undoToast && (
        <div
          role="status"
          style={{
            position: "fixed",
            left: "50%",
            bottom: isDesktop ? 28 : 20,
            transform: "translateX(-50%)",
            zIndex: 260,
            width: "min(420px, calc(100% - 28px))",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            borderRadius: 16,
            background: SOFT_SLATE.bg,
            boxShadow: SOFT_SLATE.raisedMd,
            fontFamily: SOFT_SLATE.fontFamily,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: SOFT_SLATE.textPrimary }}>
              Scan removed
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: 12,
                color: SOFT_SLATE.textMuted,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {undoToast.scan.name}
            </div>
          </div>
          <button
            type="button"
            onClick={handleUndo}
            style={{
              border: "none",
              borderRadius: 12,
              padding: "10px 14px",
              background: SOFT_SLATE.green,
              color: "#fff",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              boxShadow: SOFT_SLATE.raisedBtn,
              flexShrink: 0,
            }}
          >
            Undo
          </button>
        </div>
      )}
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

function SoftSlateChip({
  active,
  dotColor,
  label,
  onClick,
}: {
  active: boolean
  dotColor: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 14px",
        borderRadius: 999,
        border: "none",
        background: SOFT_SLATE.bg,
        boxShadow: active ? SOFT_SLATE.insetSm : SOFT_SLATE.raisedSm,
        fontFamily: SOFT_SLATE.fontFamily,
        fontSize: 12.5,
        fontWeight: 600,
        color: active ? SOFT_SLATE.textPrimary : SOFT_SLATE.textMuted,
        cursor: "pointer",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      {label}
      {active && (
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <polyline points="12 3 5.5 10 2 6.5" stroke={SOFT_SLATE.green} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

function SoftSlateOtherChip({
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
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 12px",
        borderRadius: 999,
        background: SOFT_SLATE.bg,
        boxShadow: active ? SOFT_SLATE.insetSm : SOFT_SLATE.raisedSm,
        cursor: active ? "text" : "pointer",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: SOFT_SLATE.gold, flexShrink: 0 }} />

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
            fontFamily: SOFT_SLATE.fontFamily,
            fontWeight: 600,
            fontSize: 12.5,
            color: SOFT_SLATE.textPrimary,
          }}
        />
      ) : (
        <span style={{ fontFamily: SOFT_SLATE.fontFamily, fontWeight: 600, fontSize: 12.5, color: SOFT_SLATE.textMuted }}>
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
              color: SOFT_SLATE.textMuted,
              cursor: "pointer",
              padding: 0,
              display: "flex",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </Tooltip>
      )}
    </div>
  )
}

function ProfileScreen({
  go,
}: {
  go: (s: Screen) => void
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isDesktop = useIsDesktop()
  const storedUser = loadSessionUser()

  // ── Identity ─────────────────────────────────────────────────────────────
  const [name, setName] = useState(storedUser?.name || "")
  const [email, setEmail] = useState(storedUser?.email || "")

  const [editingIdentity, setEditingIdentity] =
    useState(false)

  const [draftName, setDraftName] = useState(name)
  const [draftEmail, setDraftEmail] = useState(email)

  // ── Profile picture ──────────────────────────────────────────────────────
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() =>
    loadProfileAvatar(storedUser?.email),
  )
  const [avatarError, setAvatarError] = useState("")

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
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file.")
      e.target.value = ""
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      const dataUrl = String(reader.result || "")
      // Downscale large photos so localStorage can keep them.
      const image = new Image()
      image.onload = () => {
        const maxSide = 512
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
        const width = Math.max(1, Math.round(image.width * scale))
        const height = Math.max(1, Math.round(image.height * scale))
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          setAvatarError("Could not process this photo.")
          return
        }
        ctx.drawImage(image, 0, 0, width, height)
        const compressed = canvas.toDataURL("image/jpeg", 0.82)
        try {
          saveProfileAvatar(compressed, email)
          setAvatarUrl(compressed)
          setAvatarError("")
        } catch (error) {
          setAvatarError(error instanceof Error ? error.message : "Could not save profile picture.")
        }
      }
      image.onerror = () => setAvatarError("Could not read this photo.")
      image.src = dataUrl
    }

    reader.onerror = () => setAvatarError("Could not read this photo.")
    reader.readAsDataURL(file)

    // Allow re-selecting the same file later
    e.target.value = ""
  }

  useEffect(() => {
    setAvatarUrl(loadProfileAvatar(email))
  }, [email])

  // ── Saved preferences ────────────────────────────────────────────────────
  const [savedAllergies, setSavedAllergies] =
    useState<Set<string>>(new Set(loadHealthProfile().allergies))

  const [allergies, setAllergies] =
    useState<Set<string>>(
      new Set(savedAllergies)
    )

  const [savedHealth, setSavedHealth] =
    useState<Set<string>>(new Set(loadHealthProfile().conditions))

  const [health, setHealth] =
    useState<Set<string>>(
      new Set(savedHealth)
    )

  const [otherAllergy, setOtherAllergy] =
    useState(loadHealthProfile().otherAllergy || "")

  const [otherHealth, setOtherHealth] =
    useState(loadHealthProfile().otherCondition || "")

  const [savedOtherAllergy, setSavedOtherAllergy] = useState(otherAllergy)
  const [savedOtherHealth, setSavedOtherHealth] = useState(otherHealth)

  const [profileSaveError, setProfileSaveError] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const remote = await syncHealthProfileFromServer()
        if (cancelled) return
        setSavedAllergies(new Set(remote.allergies))
        setAllergies(new Set(remote.allergies))
        setSavedHealth(new Set(remote.conditions))
        setHealth(new Set(remote.conditions))
        setOtherAllergy(remote.otherAllergy || "")
        setOtherHealth(remote.otherCondition || "")
        setSavedOtherAllergy(remote.otherAllergy || "")
        setSavedOtherHealth(remote.otherCondition || "")
      } catch {
        // Keep local cache if the API is waking up.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
    !setsEqual(health, savedHealth) ||
    otherAllergy !== savedOtherAllergy ||
    otherHealth !== savedOtherHealth

  // ── Save preferences ────────────────────────────────────────────────────
  const handleSave = async () => {
    setProfileSaveError("")
    setProfileSaving(true)
    const next = {
      allergies: Array.from(allergies),
      conditions: Array.from(health),
      otherAllergy: otherAllergy.trim(),
      otherCondition: otherHealth.trim(),
    }
    try {
      const saved = await persistHealthProfile(next)
      setSavedAllergies(new Set(saved.allergies))
      setAllergies(new Set(saved.allergies))
      setSavedHealth(new Set(saved.conditions))
      setHealth(new Set(saved.conditions))
      setOtherAllergy(saved.otherAllergy || "")
      setOtherHealth(saved.otherCondition || "")
      setSavedOtherAllergy(saved.otherAllergy || "")
      setSavedOtherHealth(saved.otherCondition || "")
    } catch (error) {
      saveHealthProfile(next)
      setSavedAllergies(new Set(allergies))
      setSavedHealth(new Set(health))
      setSavedOtherAllergy(otherAllergy.trim())
      setSavedOtherHealth(otherHealth.trim())
      setProfileSaveError(
        error instanceof Error
          ? error.message
          : "Saved on this device, but cloud sync failed. Try again when online.",
      )
    } finally {
      setProfileSaving(false)
    }
  }

  // ── Start editing identity ───────────────────────────────────────────────
  const startEditingIdentity = () => {
    setDraftName(name)
    setDraftEmail(email)
    setEditingIdentity(true)
  }

  // ── Profile information ──────────────────────────────────────────────────
  const joinedLabel = storedUser?.joinedAt
    ? formatJoinedLabel(storedUser.joinedAt)
    : " - "

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

  const historyRecords = loadScanRecords()
  const lastScan = historyRecords[0]

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
        background: SOFT_SLATE.bg,
      }}
    >
      {/* SIDEBAR - mobile drawer only; desktop uses the Soft Slate rail below,
          same component and shading as the Dashboard. */}
      {!isDesktop && (
        <AppSidebar
          go={go}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isDesktop={false}
          active="profile"
        />
      )}

      {/* ICON RAIL - Dashboard's own rail component, reused as-is. Profile
          isn't one of its four destinations, so nothing shows active. */}
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
          <DashboardIconRail go={go} isDesktop active="profile" />
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingTop: isDesktop ? 0 : SAFE_TOP,
          boxSizing: "border-box",
          marginLeft: isDesktop ? 80 + 26 + 26 : 0,
          fontFamily: SOFT_SLATE.fontFamily,
        }}
      >
        <Center maxWidth={isDesktop ? 1420 - (80 + 26 + 26) : undefined}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 22,
              padding: isDesktop ? "26px 40px 40px 0" : "16px 14px 32px",
              boxSizing: "border-box",
              color: SOFT_SLATE.textPrimary,
              minWidth: 0,
            }}
          >
            {!isDesktop && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
                style={{
                  width: 40,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  border: "none",
                  background: SOFT_SLATE.bg,
                  color: SOFT_SLATE.textPrimary,
                  boxShadow: SOFT_SLATE.raisedSm,
                  cursor: "pointer",
                  alignSelf: "flex-start",
                }}
              >
                <svg width={18} height={14} viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="0" y1="1" x2="24" y2="1" />
                  <line x1="0" y1="9" x2="24" y2="9" />
                  <line x1="0" y1="17" x2="24" y2="17" />
                </svg>
              </button>
            )}

            {/* Header */}
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
                  My Profile
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: SOFT_SLATE.textSecondary,
                    marginTop: 4,
                  }}
                >
                  Your saved details and preferences
                </div>
              </div>

              <Tooltip label="Back to Dashboard">
                <button
                  type="button"
                  onClick={() => go("dashboard")}
                  aria-label="Back to Dashboard"
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
                    flexShrink: 0,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.green} strokeWidth="2" strokeLinecap="round">
                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <path d="M9 22V12h6v10" />
                  </svg>
                </button>
              </Tooltip>
            </div>

            {/* Two columns on desktop, stacked on mobile */}
            <div
              style={{
                display: "flex",
                gap: 22,
                alignItems: "flex-start",
                flexDirection: isDesktop ? "row" : "column",
              }}
            >
              {/* ── LEFT - identity + stats ─────────────────────────────── */}
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
                {/* Identity card */}
                <div
                  style={{
                    background: SOFT_SLATE.bg,
                    borderRadius: 26,
                    padding: isDesktop ? "30px 28px" : "24px 20px",
                    boxShadow: SOFT_SLATE.raisedLg,
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                  }}
                >
                  <div style={{ position: "relative" }}>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      style={{ display: "none" }}
                    />

                    <Tooltip label={avatarUrl ? "Change profile picture" : "Add profile picture"}>
                      <button
                        type="button"
                        onClick={openAvatarPicker}
                        aria-label={avatarUrl ? "Change profile picture" : "Add profile picture"}
                        style={{
                          width: isDesktop ? 92 : 76,
                          height: isDesktop ? 92 : 76,
                          borderRadius: "50%",
                          padding: 0,
                          background: SOFT_SLATE.bg,
                          border: `3px solid ${SOFT_SLATE.gold}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: SOFT_SLATE.raisedSm,
                          cursor: "pointer",
                          overflow: "hidden",
                          boxSizing: "border-box",
                        }}
                      >
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt="Profile"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: isDesktop ? 28 : 23,
                              fontWeight: 700,
                              color: SOFT_SLATE.textPrimary,
                            }}
                          >
                            {initials(name)}
                          </span>
                        )}
                      </button>
                    </Tooltip>

                    <Tooltip
                      label={avatarUrl ? "Change profile picture" : "Add profile picture"}
                      wrapperStyle={{ position: "absolute", bottom: -2, left: -2 }}
                    >
                      <button
                        type="button"
                        onClick={openAvatarPicker}
                        aria-label={avatarUrl ? "Change profile picture" : "Add profile picture"}
                        style={{
                          width: 26,
                          height: 26,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "50%",
                          border: `2px solid ${SOFT_SLATE.bg}`,
                          background: SOFT_SLATE.textMuted,
                          color: "#ffffff",
                          cursor: "pointer",
                          boxShadow: SOFT_SLATE.raisedSm,
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </button>
                    </Tooltip>

                    {avatarError ? (
                      <p style={{ margin: "10px 0 0", fontSize: 12, color: SOFT_SLATE.caution, lineHeight: 1.4 }}>
                        {avatarError}
                      </p>
                    ) : null}

                    {!editingIdentity && (
                      <Tooltip
                        label="Edit name and email"
                        wrapperStyle={{ position: "absolute", bottom: -2, right: -2 }}
                      >
                        <button
                          type="button"
                          onClick={startEditingIdentity}
                          aria-label="Edit name and email"
                          style={{
                            width: 26,
                            height: 26,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "50%",
                            border: `2px solid ${SOFT_SLATE.bg}`,
                            background: SOFT_SLATE.green,
                            color: "#ffffff",
                            cursor: "pointer",
                            boxShadow: SOFT_SLATE.raisedSm,
                          }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                          </svg>
                        </button>
                      </Tooltip>
                    )}
                  </div>

                  {!editingIdentity ? (
                    <>
                      <div
                        style={{
                          marginTop: 16,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 7,
                          padding: "6px 14px",
                          borderRadius: 999,
                          boxShadow: SOFT_SLATE.insetSm,
                        }}
                      >
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: SOFT_SLATE.green }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: SOFT_SLATE.green }}>{profileBadge}</span>
                      </div>

                      <h3 style={{ margin: "14px 0 0", fontSize: isDesktop ? 22 : 19, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
                        {name || "Your name"}
                      </h3>
                      <div style={{ marginTop: 6, fontSize: 13, color: SOFT_SLATE.textMuted }}>{email || "No email on file"}</div>
                      <div style={{ marginTop: 2, fontSize: 12, color: SOFT_SLATE.textMuted }}>Member since {joinedLabel}</div>
                    </>
                  ) : (
                    <div style={{ marginTop: 18, width: "100%", maxWidth: 360, textAlign: "left" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: SOFT_SLATE.textMuted }}>Name</span>
                          <input
                            autoFocus
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            placeholder="Your name"
                            style={{
                              fontFamily: SOFT_SLATE.fontFamily,
                              fontWeight: 700,
                              fontSize: 14,
                              color: SOFT_SLATE.textPrimary,
                              background: SOFT_SLATE.bg,
                              border: "none",
                              borderRadius: 12,
                              padding: "10px 12px",
                              outline: "none",
                              boxSizing: "border-box",
                              width: "100%",
                              boxShadow: SOFT_SLATE.insetSm,
                            }}
                          />
                        </label>

                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: SOFT_SLATE.textMuted }}>Email Address</span>
                          <input
                            value={draftEmail}
                            onChange={(e) => setDraftEmail(e.target.value)}
                            placeholder="you@email.com"
                            style={{
                              fontFamily: SOFT_SLATE.fontFamily,
                              fontWeight: 600,
                              fontSize: 13,
                              color: SOFT_SLATE.textPrimary,
                              background: SOFT_SLATE.bg,
                              border: "none",
                              borderRadius: 12,
                              padding: "10px 12px",
                              outline: "none",
                              boxSizing: "border-box",
                              width: "100%",
                              boxShadow: SOFT_SLATE.insetSm,
                            }}
                          />
                        </label>
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                        <button
                          type="button"
                          onClick={() => {
                            const nextName =
                              draftName.trim() || name
                            const nextEmail =
                              draftEmail.trim() || email

                            setName(nextName)
                            setEmail(nextEmail)
                            saveSessionUser({
                              name: nextName,
                              email: nextEmail,
                              joinedAt:
                                storedUser?.joinedAt ||
                                new Date().toISOString(),
                            })
                            const profile = loadHealthProfile()
                            void persistHealthProfile({
                              ...profile,
                            }).catch(() => {})
                            // Push display name to /users/me when signed in.
                            void (async () => {
                              try {
                                const token = (await import("./api/session")).getAccessToken()
                                if (!token) return
                                const { requireApiBaseUrl } = await import("./api/auth")
                                await fetch(`${requireApiBaseUrl()}/users/me`, {
                                  method: "PUT",
                                  headers: {
                                    Accept: "application/json",
                                    Authorization: `Bearer ${token}`,
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({ full_name: nextName }),
                                })
                              } catch {
                                // Local session still updated.
                              }
                            })()
                            setEditingIdentity(false)
                          }}
                          style={{
                            padding: "10px 20px",
                            borderRadius: 12,
                            border: "none",
                            background: SOFT_SLATE.green,
                            color: "#ffffff",
                            fontFamily: SOFT_SLATE.fontFamily,
                            fontWeight: 700,
                            fontSize: 12.5,
                            cursor: "pointer",
                            boxShadow: SOFT_SLATE.raisedBtn,
                          }}
                        >
                          Save
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingIdentity(false)}
                          style={{
                            padding: "10px 20px",
                            borderRadius: 12,
                            border: "none",
                            background: SOFT_SLATE.bg,
                            color: SOFT_SLATE.textMuted,
                            fontFamily: SOFT_SLATE.fontFamily,
                            fontWeight: 600,
                            fontSize: 12.5,
                            cursor: "pointer",
                            boxShadow: SOFT_SLATE.raisedBtnAlt,
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Stat row - Avoids / Watching / Last Scan */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isDesktop ? "1fr 1fr 1fr" : "1fr",
                    gap: 18,
                  }}
                >
                  <div style={{ background: SOFT_SLATE.bg, borderRadius: 20, padding: "18px 20px", boxShadow: SOFT_SLATE.insetMd, boxSizing: "border-box" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: SOFT_SLATE.textMuted }}>Avoids</div>
                    <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: SOFT_SLATE.textPrimary }}>{avoidsLabel}</div>
                  </div>
                  <div style={{ background: SOFT_SLATE.bg, borderRadius: 20, padding: "18px 20px", boxShadow: SOFT_SLATE.insetMd, boxSizing: "border-box" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: SOFT_SLATE.textMuted }}>Watching</div>
                    <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: SOFT_SLATE.textPrimary }}>{watchingLabel}</div>
                  </div>
                  <div style={{ background: SOFT_SLATE.bg, borderRadius: 20, padding: "18px 20px", boxShadow: SOFT_SLATE.insetMd, boxSizing: "border-box" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: SOFT_SLATE.textMuted }}>Last Scan</div>
                    <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: SOFT_SLATE.textPrimary }}>{lastScanLabel}</div>
                  </div>
                </div>
              </div>

              {/* ── RIGHT - preferences ─────────────────────────────────── */}
              <div
                style={{
                  width: isDesktop ? 420 : "100%",
                  flexShrink: 0,
                  background: SOFT_SLATE.bg,
                  borderRadius: 26,
                  padding: isDesktop ? "26px 24px" : "22px 20px",
                  boxShadow: SOFT_SLATE.raisedLg,
                  display: "flex",
                  flexDirection: "column",
                  gap: 22,
                  boxSizing: "border-box",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>Preferences</div>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 11px",
                      borderRadius: 999,
                      boxShadow: SOFT_SLATE.insetSm,
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: isDirty ? SOFT_SLATE.caution : SOFT_SLATE.green }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: isDirty ? SOFT_SLATE.caution : SOFT_SLATE.green }}>
                      {isDirty ? "Unsaved" : "Saved"}
                    </span>
                  </div>
                </div>

                {/* Allergies */}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>Allergies</div>
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, lineHeight: 1.5, color: SOFT_SLATE.textSecondary }}>
                    Anything you select here gets flagged the moment it shows up on a label.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginTop: 13 }}>
                    {ALLERGY_LIST.filter((i) => i.id !== "other").map((item) => (
                      <SoftSlateChip
                        key={item.id}
                        active={allergies.has(item.id)}
                        dotColor={item.iconBg}
                        label={item.label}
                        onClick={() => toggleAllergy(item.id)}
                      />
                    ))}
                    <SoftSlateOtherChip
                      active={allergies.has("other")}
                      value={otherAllergy}
                      onToggle={() => toggleAllergy("other")}
                      onChangeText={setOtherAllergy}
                      placeholder="Name an allergy"
                    />
                  </div>
                </div>

                <div style={{ width: "100%", height: 1, background: "#c6ccd4" }} />

                {/* Health conditions */}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>Health Conditions</div>
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, lineHeight: 1.5, color: SOFT_SLATE.textSecondary }}>
                    These shape how we read sodium, sugar, and saturated fat on a label.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginTop: 13 }}>
                    {HEALTH_LIST.filter((i) => i.id !== "none").map((item) => (
                      <SoftSlateChip
                        key={item.id}
                        active={health.has(item.id)}
                        dotColor={item.iconBg}
                        label={item.label}
                        onClick={() => toggleHealth(item.id)}
                      />
                    ))}
                    <SoftSlateOtherChip
                      active={health.has("other")}
                      value={otherHealth}
                      onToggle={() => toggleHealth("other")}
                      onChangeText={setOtherHealth}
                      placeholder="Name a condition"
                    />
                  </div>
                </div>

                {profileSaveError && (
                  <p style={{ margin: "0 0 10px", fontSize: 12, color: SOFT_SLATE.caution, lineHeight: 1.45 }}>
                    {profileSaveError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!isDirty || profileSaving}
                  style={{
                    border: "none",
                    borderRadius: 16,
                    background: isDirty ? SOFT_SLATE.green : SOFT_SLATE.bg,
                    color: isDirty ? "#ffffff" : SOFT_SLATE.textMuted,
                    fontFamily: SOFT_SLATE.fontFamily,
                    fontSize: 14,
                    fontWeight: 700,
                    padding: "15px 26px",
                    boxShadow: isDirty ? SOFT_SLATE.raisedBtn : SOFT_SLATE.insetSm,
                    cursor: isDirty && !profileSaving ? "pointer" : "not-allowed",
                    transition: "background 0.15s ease, box-shadow 0.15s ease",
                    opacity: profileSaving ? 0.75 : 1,
                  }}
                >
                  {profileSaving
                    ? "Saving..."
                    : isDirty
                      ? "Save changes"
                      : "No changes to save"}
                </button>
              </div>
            </div>
          </div>
        </Center>
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
      "The A-E grade summarizes a product's ingredient and nutrition quality on its own - it isn't affected by your personal allergies or health conditions. A product can be Grade A and still be flagged unsafe for you; check the Allergy & Safety result for that.",
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
  const isDesktop = useIsDesktop()
  const [openQuestion, setOpenQuestion] = useState(0)

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: SOFT_SLATE.bg,
      }}
    >
      {isDesktop && (
        <div style={{ position: "fixed", top: 22, left: 26, bottom: 22, width: 80, zIndex: 5 }}>
          <DashboardIconRail go={go} isDesktop active="help" />
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingTop: isDesktop ? 0 : SAFE_TOP,
          boxSizing: "border-box",
          marginLeft: isDesktop ? 80 + 26 + 26 : 0,
          fontFamily: SOFT_SLATE.fontFamily,
        }}
      >
        <Center maxWidth={isDesktop ? 1420 - (80 + 26 + 26) : undefined}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 22,
              padding: isDesktop ? "26px 40px 40px 0" : "16px 14px 32px",
              boxSizing: "border-box",
              color: SOFT_SLATE.textPrimary,
              minWidth: 0,
              maxWidth: 720,
            }}
          >
            {!isDesktop && <DashboardIconRail go={go} isDesktop={false} active="help" />}

            {/* Header */}
            <div>
              <div style={{ fontSize: isDesktop ? 30 : 24, fontWeight: 800, letterSpacing: "-0.02em", color: SOFT_SLATE.textPrimary }}>
                Help &amp; FAQ
              </div>
              <div style={{ fontSize: 14, color: SOFT_SLATE.textSecondary, marginTop: 4 }}>
                Answers for a safer scan
              </div>
            </div>

            {/* Intro card */}
            <div
              style={{
                background: SOFT_SLATE.bg,
                borderRadius: 26,
                padding: isDesktop ? "26px 24px" : "22px 18px",
                boxShadow: SOFT_SLATE.raisedLg,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: SOFT_SLATE.bg,
                  boxShadow: SOFT_SLATE.insetSm,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <div style={{ marginTop: 14, fontSize: 16, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
                How can we help?
              </div>
              <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.55, color: SOFT_SLATE.textSecondary }}>
                Find quick answers about scanning products and managing your nutrition profile.
              </div>
            </div>

            {/* FAQ */}
            <div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: SOFT_SLATE.textMuted,
                  margin: "0 0 10px 4px",
                }}
              >
                Frequently asked questions
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {FAQ_ITEMS.map((item, index) => {
                  const open = openQuestion === index

                  return (
                    <div
                      key={item.question}
                      style={{
                        background: SOFT_SLATE.bg,
                        borderRadius: 18,
                        padding: "17px 20px",
                        boxShadow: open ? SOFT_SLATE.insetSm : SOFT_SLATE.raisedSm,
                        boxSizing: "border-box",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenQuestion(open ? -1 : index)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          width: "100%",
                          border: "none",
                          background: "none",
                          padding: 0,
                          textAlign: "left",
                          cursor: "pointer",
                          fontFamily: SOFT_SLATE.fontFamily,
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: SOFT_SLATE.textPrimary,
                        }}
                      >
                        <span>{item.question}</span>
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={SOFT_SLATE.textMuted}
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            flexShrink: 0,
                            transform: open ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.15s",
                          }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {open && (
                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 12,
                            borderTop: "1px solid #c6ccd4",
                            fontSize: 12.5,
                            lineHeight: 1.6,
                            color: SOFT_SLATE.textSecondary,
                          }}
                        >
                          {item.answer}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Contact support */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 18px",
                borderRadius: 18,
                background: SOFT_SLATE.bg,
                boxShadow: SOFT_SLATE.insetMd,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: SOFT_SLATE.bg,
                  boxShadow: SOFT_SLATE.raisedSm,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16v12H7l-3 3z" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: SOFT_SLATE.textPrimary }}>Still need help?</div>
                <div style={{ marginTop: 3, fontSize: 11.5, color: SOFT_SLATE.textSecondary }}>Contact us at support@scanity.app</div>
              </div>
            </div>
          </div>
        </Center>
      </div>
    </div>
  )
}


/* =========================================================
   ABOUT
   ========================================================= */

function AboutScreen({ go }: { go: (s: Screen) => void }) {
  const isDesktop = useIsDesktop()

  const features = [
    {
      title: "Personalized Safety",
      text: "Scanity checks products against your allergies, dietary restrictions, and health conditions.",
      path: (
        <path d="M12 2 4 5v6c0 5.5 3.8 9.7 8 11 4.2-1.3 8-5.5 8-11V5z" />
      ),
    },
    {
      title: "Smart Scanning",
      text: "Scan a barcode or capture a nutrition label using OCR to identify useful information.",
      path: (
        <>
          <rect x="3" y="4" width="2" height="16" />
          <rect x="7" y="4" width="1" height="16" />
          <rect x="10" y="4" width="3" height="16" />
          <rect x="15" y="4" width="1" height="16" />
          <rect x="18" y="4" width="2" height="16" />
          <rect x="21" y="4" width="1" height="16" />
        </>
      ),
    },
    {
      title: "Nutrition Insights",
      text: "Get an easy-to-understand nutrition score based on important nutritional factors.",
      path: (
        <>
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
        </>
      ),
    },
    {
      title: "AI Explanations",
      text: "Understand why a product may be safe, cautionary, or unsafe for you.",
      path: (
        <>
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12.7c.5.4.9 1 1 1.8v.5h6v-.5c.1-.8.5-1.4 1-1.8A7 7 0 0 0 12 2Z" />
        </>
      ),
    },
  ]

  const steps = [
    {
      num: "01",
      title: "Scan",
      text: "Scan the product barcode or food label.",
      path: (
        <>
          <rect x="3" y="4" width="2" height="16" />
          <rect x="7" y="4" width="1" height="16" />
          <rect x="10" y="4" width="3" height="16" />
          <rect x="15" y="4" width="1" height="16" />
          <rect x="18" y="4" width="2" height="16" />
        </>
      ),
    },
    {
      num: "02",
      title: "Analyze",
      text: "Scanity analyzes ingredients and nutrition information.",
      path: (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </>
      ),
    },
    {
      num: "03",
      title: "Personalize",
      text: "The system compares the product against your health profile.",
      path: (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M6 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
        </>
      ),
    },
    {
      num: "04",
      title: "Understand",
      text: "Scanity explains potential risks and unfamiliar ingredients.",
      path: (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M9 13h6" />
          <path d="M9 17h6" />
        </>
      ),
    },
    {
      num: "05",
      title: "Decide",
      text: "Safe, caution, or avoid recommendation.",
      path: (
        <path d="M12 2 4 5v6c0 5.5 3.8 9.7 8 11 4.2-1.3 8-5.5 8-11V5z" />
      ),
    },
  ]

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: SOFT_SLATE.bg,
      }}
    >
      {isDesktop && (
        <div style={{ position: "fixed", top: 22, left: 26, bottom: 22, width: 80, zIndex: 5 }}>
          <DashboardIconRail go={go} isDesktop active="about" />
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingTop: isDesktop ? 0 : SAFE_TOP,
          boxSizing: "border-box",
          marginLeft: isDesktop ? 80 + 26 + 26 : 0,
          fontFamily: SOFT_SLATE.fontFamily,
        }}
      >
        <Center maxWidth={isDesktop ? 1420 - (80 + 26 + 26) : undefined}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
              padding: isDesktop ? "26px 40px 40px 0" : "16px 14px 32px",
              boxSizing: "border-box",
              color: SOFT_SLATE.textPrimary,
              minWidth: 0,
            }}
          >
            {!isDesktop && <DashboardIconRail go={go} isDesktop={false} active="about" />}

            {/* Header */}
            <div>
              <div style={{ fontSize: isDesktop ? 30 : 24, fontWeight: 800, letterSpacing: "-0.02em", color: SOFT_SLATE.textPrimary }}>
                About Us
              </div>
            </div>

            {/* Hero card */}
            <div
              style={{
                position: "relative",
                borderRadius: 28,
                overflow: "hidden",
                boxShadow: SOFT_SLATE.raisedLg,
                minHeight: isDesktop ? 300 : 340,
                display: "flex",
                alignItems: "center",
              }}
            >
              <img
                src={aboutHeroImg}
                alt="Person shopping for food in a grocery store"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
              />
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(120deg, rgba(43,49,56,0.88), rgba(30,107,63,0.82))` }} />
              <div style={{ position: "relative", zIndex: 1, padding: isDesktop ? "44px 40px" : "34px 22px", maxWidth: 560 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)" }}>
                  About Scanity
                </div>
                <div style={{ marginTop: 12, fontSize: isDesktop ? 28 : 22, fontWeight: 800, lineHeight: 1.15, color: "#ffffff" }}>
                  Making every food choice safer, simpler, and smarter.
                </div>
                <div style={{ marginTop: 14, maxWidth: 460, fontSize: 12.5, lineHeight: 1.6, color: "rgba(255,255,255,0.85)" }}>
                  Scanity is an AI-powered food safety and nutrition decision support tool that helps consumers understand food labels and determine whether packaged food products are suitable for their personal health profile.
                </div>
              </div>
            </div>

            {/* Label explainer */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr",
                alignItems: "center",
                gap: isDesktop ? 26 : 18,
                background: SOFT_SLATE.bg,
                borderRadius: 26,
                padding: isDesktop ? "28px 26px" : "22px 18px",
                boxShadow: SOFT_SLATE.raisedMd,
                boxSizing: "border-box",
              }}
            >
              <div>
                <div style={{ fontSize: isDesktop ? 19 : 17, fontWeight: 800, lineHeight: 1.2, color: SOFT_SLATE.textPrimary }}>
                  Food labels shouldn't be difficult to understand.
                </div>
                <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.6, color: SOFT_SLATE.textSecondary }}>
                  Ingredients and nutrition facts can contain technical terms that are difficult for ordinary consumers to interpret. Scanity transforms this information into simple, understandable insights so users can make more informed food choices.
                </div>
              </div>
              <img
                src={aboutLabelImg}
                alt="Nutrition facts label"
                style={{ width: "100%", height: isDesktop ? 160 : 180, objectFit: "cover", objectPosition: "center", borderRadius: 18 }}
              />
            </div>

            {/* Feature grid */}
            <div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: SOFT_SLATE.textMuted,
                  margin: "0 0 10px 4px",
                }}
              >
                How Scanity Helps
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(4, 1fr)" : "1fr 1fr", gap: 16 }}>
                {features.map((feature) => (
                  <div
                    key={feature.title}
                    style={{
                      background: SOFT_SLATE.bg,
                      borderRadius: 20,
                      padding: 20,
                      boxShadow: SOFT_SLATE.raisedMd,
                      boxSizing: "border-box",
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 13,
                        background: SOFT_SLATE.bg,
                        boxShadow: SOFT_SLATE.insetSm,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {feature.path}
                      </svg>
                    </div>
                    <div style={{ marginTop: 14, fontSize: 14, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>{feature.title}</div>
                    <div style={{ marginTop: 5, fontSize: 11.5, lineHeight: 1.55, color: SOFT_SLATE.textSecondary }}>{feature.text}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* How it works */}
            <div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: SOFT_SLATE.textMuted,
                  margin: "0 0 10px 4px",
                }}
              >
                How It Works
              </div>
              <div
                style={{
                  background: SOFT_SLATE.bg,
                  borderRadius: 26,
                  padding: isDesktop ? "26px 24px" : "22px 16px",
                  boxShadow: SOFT_SLATE.raisedMd,
                  boxSizing: "border-box",
                  display: "grid",
                  gridTemplateColumns: isDesktop ? "repeat(5, 1fr)" : "1fr 1fr",
                  gap: isDesktop ? 14 : 22,
                }}
              >
                {steps.map((step) => (
                  <div key={step.title} style={{ textAlign: "center", padding: "0 6px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: SOFT_SLATE.gold, marginBottom: 8 }}>{step.num}</div>
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        margin: "0 auto 10px",
                        borderRadius: 16,
                        background: SOFT_SLATE.bg,
                        boxShadow: SOFT_SLATE.raisedSm,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {step.path}
                      </svg>
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>{step.title}</div>
                    <div style={{ marginTop: 5, fontSize: 10.5, lineHeight: 1.5, color: SOFT_SLATE.textSecondary }}>{step.text}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Purpose banner */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                padding: isDesktop ? "22px 26px" : "20px 18px",
                borderRadius: 22,
                background: SOFT_SLATE.bg,
                boxShadow: SOFT_SLATE.insetMd,
                boxSizing: "border-box",
              }}
            >
              <img
                src={logoImg}
                alt="Scanity logo"
                style={{ width: isDesktop ? 64 : 48, height: isDesktop ? 64 : 48, objectFit: "contain", flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: SOFT_SLATE.textMuted }}>
                  Our Purpose
                </div>
                <div style={{ marginTop: 4, fontSize: isDesktop ? 16 : 14, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
                  We believe understanding what you eat should be simple.
                </div>
                <div style={{ marginTop: 6, maxWidth: 560, fontSize: 11.5, lineHeight: 1.55, color: SOFT_SLATE.textSecondary }}>
                  Scanity was created to help consumers better understand food labels, recognize potentially unsafe ingredients, and make food decisions based on their individual health needs.
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
                padding: "4px 6px",
                fontSize: 10.5,
                color: SOFT_SLATE.textMuted,
              }}
            >
              <span>Scanity &nbsp;&middot;&nbsp; See &middot; Know &middot; Eat</span>
              <span>About &nbsp;&middot;&nbsp; Privacy Policy &nbsp;&middot;&nbsp; Terms &nbsp;&middot;&nbsp; Contact</span>
            </div>
          </div>
        </Center>
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
        position: "relative",
        overflow: "hidden",
        background: SOFT_SLATE.bg,
      }}
    >
      {isDesktop && (
        <div style={{ position: "fixed", top: 22, left: 26, bottom: 22, width: 80, zIndex: 5 }}>
          <DashboardIconRail go={go} isDesktop active="settings" />
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingTop: isDesktop ? 0 : SAFE_TOP,
          boxSizing: "border-box",
          marginLeft: isDesktop ? 80 + 26 + 26 : 0,
          fontFamily: SOFT_SLATE.fontFamily,
        }}
      >
        <Center maxWidth={isDesktop ? 1420 - (80 + 26 + 26) : undefined}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 22,
              padding: isDesktop ? "26px 40px 40px 0" : "16px 14px 32px",
              boxSizing: "border-box",
              color: SOFT_SLATE.textPrimary,
              minWidth: 0,
              maxWidth: 720,
            }}
          >
            {!isDesktop && <DashboardIconRail go={go} isDesktop={false} active="settings" />}

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
              <div>
                <div style={{ fontSize: isDesktop ? 30 : 24, fontWeight: 800, letterSpacing: "-0.02em", color: SOFT_SLATE.textPrimary }}>
                  {privacy ? "Privacy Policy" : "Terms of Service"}
                </div>
                <div style={{ fontSize: 14, color: SOFT_SLATE.textSecondary, marginTop: 4 }}>
                  {privacy ? "Your information and choices" : "Using Scanity responsibly"}
                </div>
              </div>

            </div>

            {/* Intro card */}
            <div
              style={{
                background: SOFT_SLATE.bg,
                borderRadius: 26,
                padding: isDesktop ? "26px 24px" : "22px 18px",
                boxShadow: SOFT_SLATE.raisedLg,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: SOFT_SLATE.bg,
                  boxShadow: SOFT_SLATE.insetSm,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {privacy ? (
                    <path d="M12 2 4 5v6c0 5.5 3.8 9.7 8 11 4.2-1.3 8-5.5 8-11V5z" />
                  ) : (
                    <>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                      <path d="M9 13h6" />
                      <path d="M9 17h6" />
                    </>
                  )}
                </svg>
              </div>
              <div style={{ marginTop: 14, fontSize: 16, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
                {privacy ? "Your privacy matters" : "A few important notes"}
              </div>
              <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.55, color: SOFT_SLATE.textSecondary }}>
                {privacy
                  ? "Here is how Scanity uses information to personalize your experience."
                  : "Please read these guidelines before using Scanity."}
              </div>
            </div>

            {/* Sections */}
            <div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: SOFT_SLATE.textMuted,
                  margin: "0 0 10px 4px",
                }}
              >
                {privacy ? "Policy details" : "Terms details"}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sections.map(([title, text]) => (
                  <div
                    key={title}
                    style={{
                      background: SOFT_SLATE.bg,
                      borderRadius: 18,
                      padding: "18px 20px",
                      boxShadow: SOFT_SLATE.raisedSm,
                      boxSizing: "border-box",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: SOFT_SLATE.textPrimary }}>{title}</div>
                    <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: SOFT_SLATE.textSecondary }}>{text}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ textAlign: "center", fontSize: 11, color: SOFT_SLATE.textMuted, marginTop: 4 }}>
              Last updated August 2026
            </div>
          </div>
        </Center>
      </div>
    </div>
  )
}
function SettingsScreen({ go }: { go: (s: Screen) => void }) {
  const isDesktop = useIsDesktop()

  const Section = ({ title }: { title: string }) => (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: SOFT_SLATE.textMuted,
        margin: "0 0 10px 4px",
      }}
    >
      {title}
    </div>
  )

  const Chevron = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.textMuted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
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
        {...(onClick ? { type: "button" as const, onClick } : {})}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 18px",
          borderRadius: 18,
          background: SOFT_SLATE.bg,
          boxShadow: SOFT_SLATE.raisedSm,
          boxSizing: "border-box",
          border: "none",
          cursor: onClick ? "pointer" : "default",
          textAlign: "left",
          fontFamily: SOFT_SLATE.fontFamily,
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 13,
            background: SOFT_SLATE.bg,
            boxShadow: SOFT_SLATE.insetSm,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={danger ? SOFT_SLATE.unsafe : SOFT_SLATE.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {icon}
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: danger ? SOFT_SLATE.unsafe : SOFT_SLATE.textPrimary }}>
            {label}
          </div>
          {sub && (
            <div style={{ marginTop: 2, fontSize: 11.5, color: SOFT_SLATE.textMuted }}>
              {sub}
            </div>
          )}
        </div>

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
        background: SOFT_SLATE.bg,
      }}
    >
      {isDesktop && (
        <div style={{ position: "fixed", top: 22, left: 26, bottom: 22, width: 80, zIndex: 5 }}>
          <DashboardIconRail go={go} isDesktop active="settings" />
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingTop: isDesktop ? 0 : SAFE_TOP,
          boxSizing: "border-box",
          marginLeft: isDesktop ? 80 + 26 + 26 : 0,
          fontFamily: SOFT_SLATE.fontFamily,
        }}
      >
        <Center maxWidth={isDesktop ? 1420 - (80 + 26 + 26) : undefined}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 22,
              padding: isDesktop ? "26px 40px 40px 0" : "16px 14px 32px",
              boxSizing: "border-box",
              color: SOFT_SLATE.textPrimary,
              minWidth: 0,
              maxWidth: 640,
            }}
          >
            {!isDesktop && <DashboardIconRail go={go} isDesktop={false} active="settings" />}

            {/* Header */}
            <div>
              <div style={{ fontSize: isDesktop ? 30 : 24, fontWeight: 800, letterSpacing: "-0.02em", color: SOFT_SLATE.textPrimary }}>
                Settings
              </div>
              <div style={{ fontSize: 14, color: SOFT_SLATE.textSecondary, marginTop: 4 }}>
                Customize your Scanity experience
              </div>
            </div>

            {/* SECURITY */}
            <div>
              <Section title="Security" />
              <Row
                onClick={() => go("changePassword")}
                label="Change Password"
                sub="Update your current password"
                right={<Chevron />}
                icon={
                  <>
                    <circle cx="7.5" cy="15.5" r="5.5" />
                    <path d="m21 2-9.6 9.6" />
                    <path d="m15.5 7.5 3 3L22 7l-3-3" />
                  </>
                }
              />
            </div>

            {/* SUPPORT & INFO */}
            <div>
              <Section title="Support & Info" />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Row
                  onClick={() => go("privacy")}
                  label="Privacy Policy"
                  right={<Chevron />}
                  icon={<path d="M12 2 4 5v6c0 5.5 3.8 9.7 8 11 4.2-1.3 8-5.5 8-11V5z" />}
                />
                <Row
                  onClick={() => go("terms")}
                  label="Terms of Service"
                  right={<Chevron />}
                  icon={
                    <>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                      <path d="M9 13h6" />
                      <path d="M9 17h6" />
                    </>
                  }
                />
              </div>
            </div>

            {/* ACCOUNT */}
            <div>
              <Section title="Account" />
              <Row
                danger
                onClick={() => go("delete")}
                label="Delete Account"
                sub="Permanently delete your account"
                right={<Chevron />}
                icon={
                  <>
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </>
                }
              />
            </div>
          </div>
        </Center>
      </div>
    </div>
  )
}

function ChangePasswordScreen({
  go,
}: {
  go: (s: Screen) => void
}) {
  const isDesktop = useIsDesktop()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showSaved, setShowSaved] = useState(false)

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword

  const handleUpdate = () => {
    if (!canSubmit) return

    setShowSaved(true)

    setTimeout(() => {
      setShowSaved(false)
      go("settings")
    }, 1400)
  }

  const Field = ({
    label,
    value,
    onChange,
  }: {
    label: string
    value: string
    onChange: (v: string) => void
  }) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: SOFT_SLATE.textMuted }}>{label}</span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 16px",
          borderRadius: 14,
          background: SOFT_SLATE.bg,
          boxShadow: SOFT_SLATE.insetMd,
          boxSizing: "border-box",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            background: "none",
            outline: "none",
            fontFamily: SOFT_SLATE.fontFamily,
            fontSize: 13,
            color: SOFT_SLATE.textPrimary,
          }}
        />
      </div>
    </label>
  )

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: SOFT_SLATE.bg,
      }}
    >
      {isDesktop && (
        <div style={{ position: "fixed", top: 22, left: 26, bottom: 22, width: 80, zIndex: 5 }}>
          <DashboardIconRail go={go} isDesktop active="settings" />
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingTop: isDesktop ? 0 : SAFE_TOP,
          boxSizing: "border-box",
          marginLeft: isDesktop ? 80 + 26 + 26 : 0,
          fontFamily: SOFT_SLATE.fontFamily,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!isDesktop && (
          <div style={{ padding: "16px 14px 0" }}>
            <DashboardIconRail go={go} isDesktop={false} active="settings" />
          </div>
        )}

        <div style={{ padding: isDesktop ? "22px 40px 8px 0" : "18px 14px 0" }}>
          <Tooltip label="Back to Settings">
            <button
              type="button"
              onClick={() => go("settings")}
              aria-label="Back to Settings"
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
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.green} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </Tooltip>
        </div>

        <div
          style={{
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
              maxWidth: 420,
              background: SOFT_SLATE.bg,
              borderRadius: 28,
              padding: isDesktop ? "34px 32px" : "28px 22px",
              boxShadow: SOFT_SLATE.raisedLg,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: SOFT_SLATE.bg,
                boxShadow: SOFT_SLATE.insetSm,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="7.5" cy="15.5" r="5.5" />
                <path d="m21 2-9.6 9.6" />
                <path d="m15.5 7.5 3 3L22 7l-3-3" />
              </svg>
            </div>

            <div style={{ marginTop: 16, fontSize: 19, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
              Change Password
            </div>
            <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5, color: SOFT_SLATE.textSecondary }}>
              Use at least 8 characters with 1 number.
            </div>

            <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="Current Password" value={currentPassword} onChange={setCurrentPassword} />
              <Field label="New Password" value={newPassword} onChange={setNewPassword} />
              <Field label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} />
            </div>

            <button
              type="button"
              disabled={!canSubmit || showSaved}
              onClick={handleUpdate}
              style={{
                width: "100%",
                marginTop: 24,
                padding: 15,
                border: "none",
                borderRadius: 16,
                background: SOFT_SLATE.green,
                color: "#ffffff",
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 14,
                fontWeight: 700,
                boxShadow: "6px 6px 14px #c6ccd4, -4px -4px 10px #ffffff",
                cursor: canSubmit && !showSaved ? "pointer" : "not-allowed",
                opacity: canSubmit ? 1 : 0.6,
                boxSizing: "border-box",
              }}
            >
              {showSaved ? "Password Updated" : "Update Password"}
            </button>

            <button
              type="button"
              onClick={() => go("settings")}
              style={{
                width: "100%",
                marginTop: 10,
                padding: 15,
                border: "none",
                borderRadius: 16,
                background: SOFT_SLATE.bg,
                color: SOFT_SLATE.textMuted,
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 14,
                fontWeight: 700,
                boxShadow: SOFT_SLATE.raisedSm,
                cursor: "pointer",
                boxSizing: "border-box",
              }}
            >
              Cancel
            </button>
          </div>
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
  const isDesktop = useIsDesktop()
  const [showDeleteLoading, setShowDeleteLoading] = useState(false)

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: SOFT_SLATE.bg,
      }}
    >
      {isDesktop && (
        <div style={{ position: "fixed", top: 22, left: 26, bottom: 22, width: 80, zIndex: 5 }}>
          <DashboardIconRail go={go} isDesktop active="settings" />
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingTop: isDesktop ? 0 : SAFE_TOP,
          boxSizing: "border-box",
          marginLeft: isDesktop ? 80 + 26 + 26 : 0,
          fontFamily: SOFT_SLATE.fontFamily,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!isDesktop && (
          <div style={{ padding: "16px 14px 0" }}>
            <DashboardIconRail go={go} isDesktop={false} active="settings" />
          </div>
        )}

        <div style={{ padding: isDesktop ? "22px 40px 8px 0" : "18px 14px 0" }}>
        </div>

        <div
          style={{
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
              maxWidth: 400,
              background: SOFT_SLATE.bg,
              borderRadius: 28,
              padding: isDesktop ? "38px 32px" : "32px 24px",
              boxShadow: SOFT_SLATE.raisedLg,
              boxSizing: "border-box",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 76,
                height: 76,
                margin: "0 auto 18px",
                borderRadius: "50%",
                background: SOFT_SLATE.bg,
                boxShadow: SOFT_SLATE.insetMd,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.unsafe} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </div>

            <div style={{ fontSize: 19, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
              Delete your account?
            </div>

            <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.55, color: SOFT_SLATE.textSecondary }}>
              This action cannot be undone. All your data, scan history, and preferences will be permanently deleted.
            </div>

            <div
              style={{
                marginTop: 20,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "13px 15px",
                borderRadius: 14,
                background: SOFT_SLATE.bg,
                boxShadow: SOFT_SLATE.insetSm,
                textAlign: "left",
                boxSizing: "border-box",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="m21.7 18.4-8.6-15a1.5 1.5 0 0 0-2.6 0l-8.6 15a1.5 1.5 0 0 0 1.3 2.2h17.2a1.5 1.5 0 0 0 1.3-2.2Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <span style={{ fontSize: 11.5, color: SOFT_SLATE.textSecondary }}>This action cannot be undone.</span>
            </div>

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
                marginTop: 22,
                padding: 15,
                border: "none",
                borderRadius: 16,
                background: SOFT_SLATE.unsafe,
                color: "#ffffff",
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 14,
                fontWeight: 700,
                boxShadow: "6px 6px 14px #c6ccd4, -4px -4px 10px #ffffff",
                cursor: showDeleteLoading ? "not-allowed" : "pointer",
                opacity: showDeleteLoading ? 0.7 : 1,
                boxSizing: "border-box",
              }}
            >
              Yes, Delete My Account
            </button>

            <button
              type="button"
              disabled={showDeleteLoading}
              onClick={() => go("settings")}
              style={{
                width: "100%",
                marginTop: 10,
                padding: 15,
                border: "none",
                borderRadius: 16,
                background: SOFT_SLATE.bg,
                color: SOFT_SLATE.textMuted,
                fontFamily: SOFT_SLATE.fontFamily,
                fontSize: 14,
                fontWeight: 700,
                boxShadow: SOFT_SLATE.raisedSm,
                cursor: showDeleteLoading ? "not-allowed" : "pointer",
                opacity: showDeleteLoading ? 0.6 : 1,
                boxSizing: "border-box",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Delete loading overlay */}
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
            background: "rgba(36,41,47,0.55)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 320,
              background: SOFT_SLATE.bg,
              borderRadius: 28,
              padding: "30px 24px 26px",
              boxShadow: SOFT_SLATE.raisedLg,
              boxSizing: "border-box",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 70,
                height: 70,
                margin: "0 auto 16px",
                borderRadius: "50%",
                background: SOFT_SLATE.bg,
                boxShadow: SOFT_SLATE.insetMd,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke={SOFT_SLATE.unsafe} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </div>

            <div style={{ fontSize: 17, fontWeight: 800, color: SOFT_SLATE.textPrimary }}>
              Deleting Account
            </div>

            <div style={{ marginTop: 7, fontSize: 11.5, color: SOFT_SLATE.textMuted }}>
              Please wait...
            </div>

            <div
              style={{
                marginTop: 19,
                width: "100%",
                height: 8,
                borderRadius: 8,
                overflow: "hidden",
                background: SOFT_SLATE.bg,
                boxShadow: SOFT_SLATE.insetSm,
              }}
            >
              <div
                style={{
                  width: "0%",
                  height: "100%",
                  borderRadius: 8,
                  background: SOFT_SLATE.unsafe,
                  animation: "deleteProgress 1.8s linear forwards",
                }}
              />
            </div>

            <div style={{ marginTop: 11, fontSize: 11, fontWeight: 600, color: SOFT_SLATE.textSecondary }}>
              Please wait a moment.
            </div>
          </div>
        </div>
      )}

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
  "about", "privacy", "terms", "settings", "delete", "changePassword", "forgotPassword",
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
    // sessionStorage unavailable (private browsing, etc.) - just start fresh
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
    changePassword: <ChangePasswordScreen go={go} />,
    forgotPassword: <ForgotPasswordScreen go={go} goBack={goBack} />,
    resetPassword: <ResetPasswordScreen go={go} />,
    confirmationPassword: <ConfirmationPasswordScreen go={go} />,
    productResult: <ProductResultScreen go={go} />,
    productCompare: <ProductCompareScreen go={go} goBack={goBack} />,
  }
  return <AppFrame>{screenMap[screen]}</AppFrame>
}