import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// سب صفحے سرور پر بنتے ہیں (لنک کارڈ کے ٹیگ پہلے ہی HTML میں ہوتے ہیں)
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  site: 'https://inshaenau.com',
  security: { checkOrigin: true },
  devToolbar: { enabled: false },
});
