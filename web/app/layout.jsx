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
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%230b1220'/><path d='M16 6l8 5v10l-8 5-8-5V11z' fill='none' stroke='%234f9cf9' stroke-width='2'/></svg>"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
