import './globals.css';

export const metadata = {
  title: 'Tamil Nadu Power Center',
  description: 'Executive operating system for government performance.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#080c14' },
    { media: '(prefers-color-scheme: light)', color: '#f3f5f9' },
  ],
};

const THEME_BOOT = `(function(){try{var t=localStorage.getItem('tnpc-theme');if(t!=='light'&&t!=='dark')t='dark';var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link
          rel="icon"
          href="/brand/tamil-nadu-emblem.png"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
