import { Head, Html, Main, NextScript } from "next/document";

import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="description" content={APP_DESCRIPTION} />
        <meta name="theme-color" content="#2563eb" />
        <link rel="icon" href="/favicon.ico" />
        <title>{APP_NAME}</title>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
