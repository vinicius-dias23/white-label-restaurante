import type { SVGProps } from 'react'

/** Ícones inline — evita uma dependência inteira para meia dúzia de traços. */

type IconProps = SVGProps<SVGSVGElement>

const base = (props: IconProps) => ({
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
})

export const WhatsAppIcon = (props: IconProps) => (
  <svg {...base(props)} stroke="none" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.2 8.2 0 0 1 8.24 8.24c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.44.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.02 2.56c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z" />
  </svg>
)

export const InstagramIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="3.6" />
    <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
  </svg>
)

export const FacebookIcon = (props: IconProps) => (
  <svg {...base(props)} stroke="none" fill="currentColor">
    <path d="M13.5 21v-7.5h2.5l.5-3h-3V8.7c0-.87.24-1.46 1.49-1.46H16.7V4.56A20 20 0 0 0 14.37 4.4c-2.3 0-3.87 1.4-3.87 3.98V10.5H8v3h2.5V21Z" />
  </svg>
)

export const TikTokIcon = (props: IconProps) => (
  <svg {...base(props)} stroke="none" fill="currentColor">
    <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-1.79-2.46V9.8a5.72 5.72 0 1 0 4.88 5.66V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.29 4.29 0 0 1-3.24-1.48Z" />
  </svg>
)

export const PhoneIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 5.2 2 2 0 0 1 5.5 3Z" />
  </svg>
)

export const PinIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </svg>
)

export const RouteIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m3 11 18-8-8 18-2-8-8-2Z" />
  </svg>
)

export const ClockIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.2 2" />
  </svg>
)

export const RazorIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M8 16 20 4M8 16l2.4 2.4L22.4 6.4 20 4M8 16l-2.4 2.4L8 20.8" />
    <path d="M5.6 18.4 2 22" />
  </svg>
)

export const ScissorsIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="6" cy="6" r="2.6" />
    <circle cx="6" cy="18" r="2.6" />
    <path d="M8 7.6 20 18M8 16.4 20 6" />
  </svg>
)

export const StarIcon = (props: IconProps) => (
  <svg {...base(props)} stroke="none" fill="currentColor">
    <path d="m12 3.6 2.6 5.3 5.9.86-4.25 4.15 1 5.87L12 17l-5.25 2.78 1-5.87L3.5 9.76l5.9-.86Z" />
  </svg>
)

export const ArrowDownIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 4v15m0 0 6-6m-6 6-6-6" />
  </svg>
)

export const ArrowLeftIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M20 12H4m0 0 6-6m-6 6 6 6" />
  </svg>
)

export const ArrowRightIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 12h16m0 0-6-6m6 6-6 6" />
  </svg>
)

export const CloseIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M6 6 18 18M18 6 6 18" />
  </svg>
)

export const MenuIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)

export const MailIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
)
