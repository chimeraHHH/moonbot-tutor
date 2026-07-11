import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LandingPage } from '@/components/landing/landing-page';

describe('LandingPage', () => {
  it('renders the four sections and student entry routes', () => {
    const html = renderToStaticMarkup(createElement(LandingPage));
    expect(html).toContain('星燧计划');
    expect(html).toContain('id="homeView"');
    expect(html).toContain('id="aerospaceView"');
    expect(html).toContain('id="pricingView"');
    expect(html.match(/\/student\?preset=myth/g)).toHaveLength(4);
    expect(html).toContain('/student?preset=rocket');
    expect(html).toContain('href="/student"');
  });
});
