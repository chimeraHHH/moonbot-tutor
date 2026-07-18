import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LandingPage } from '@/components/landing/landing-page';
import { readFileSync } from 'node:fs';

describe('LandingPage', () => {
  it('cache-busts CSS background assets after deployment updates', () => {
    const css = readFileSync(new URL('../app/landing.css', import.meta.url), 'utf8');
    expect(css).toContain("/landing/134background.png?v=20260711");
    expect(css).toContain("/landing/background.png?v=20260711");
  });
  it('renders the four sections and student entry routes', () => {
    const html = renderToStaticMarkup(createElement(LandingPage));
    expect(html).toContain('星燧计划');
    expect(html).toContain('aria-label="Sophos">Sophos</div>');
    expect(html).toContain('href="/student">进入星燧</a>');
    expect(html).toContain('id="homeView"');
    expect(html).toContain('id="aerospaceView"');
    expect(html).toContain('id="pricingView"');
    // Deep-space landing: each celestial node routes to its own preset.
    expect(html).toContain('/student?preset=sun');
    expect(html).toContain('/student?preset=moon');
    expect(html).toContain('/student?preset=mars');
    expect(html).toContain('/student?preset=stars');
    expect(html).toContain('/student?preset=chanye');
    expect(html).toContain('/student?preset=rocket');
    expect(html).toContain('href="/student"');
  });
});
