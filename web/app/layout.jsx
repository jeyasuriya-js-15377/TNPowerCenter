import './globals.css';

export const metadata = {
  title: 'Tamil Nadu Power Center',
  description:
    'Executive operating system for government performance. Runs entirely on Zoho Projects.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#080c14',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%230b1220'/><path d='M16 6l8 5v10l-8 5-8-5V11z' fill='none' stroke='%234f9cf9' stroke-width='2'/></svg>"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
