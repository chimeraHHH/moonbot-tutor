'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

const PRESET = (key: string) => `/student?preset=${key}`;

export function LandingPage() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sections = [...root.querySelectorAll<HTMLElement>('[data-landing-section]')];
    if (reduced) sections.forEach((section) => section.classList.add('is-visible'));

    const observer = reduced
      ? null
      : new IntersectionObserver(
          (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('is-visible')),
          { threshold: 0.22 },
        );
    sections.forEach((section) => observer?.observe(section));

    let frame = 0;
    const updateParallax = () => {
      frame = 0;
      if (reduced) return;
      root.style.setProperty('--landing-scroll', `${window.scrollY}`);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateParallax);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const current = sections.reduce((best, section, index) => {
        const distance = Math.abs(section.getBoundingClientRect().top);
        return distance < best.distance ? { index, distance } : best;
      }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
      const next = event.key === 'ArrowDown' ? Math.min(current + 1, sections.length - 1) : Math.max(current - 1, 0);
      if (next !== current) {
        event.preventDefault();
        sections[next]?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    updateParallax();
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKeyDown);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const scrollToSolar = () => document.querySelector('#homeView')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <main ref={rootRef} className="landing-page min-h-screen bg-[#050711] text-[#fff4dc]">
      <section id="zhixiangView" data-landing-section className="zhixiang-view landing-reveal" aria-label="星燧计划封面">
        <div className="landing-brand" aria-label="Sophos">Sophos</div>
        <div className="zhixiang-center">
          <p className="zhixiang-title">星燧计划</p>
          <h1 className="zhixiang-sub">为人类生一簇篝火</h1>
          <Link href="/student" className="enter-btn">进入星燧</Link>
          <button onClick={scrollToSolar} className="scroll-cue" type="button" aria-label="向下浏览">
            <span>向下探索</span><i aria-hidden="true" />
          </button>
        </div>
      </section>

      <section id="homeView" data-landing-section className="home-view landing-reveal" aria-label="浪漫幻想">
        <Link className="yinghe-corner" href={PRESET('stars')} aria-label="进入银河星宿课堂">
          <img src="/landing/yinghe.png" alt="银河" /><span>银河</span>
        </Link>
        <header className="home-header"><div className="header-text-box"><p className="brand-title">浪漫幻想</p></div></header>
        <div className="orbit-field" data-parallax aria-label="天体入口">
          <Link className="celestial sun-node active" href={PRESET('sun')} aria-label="进入太阳羲和课堂">
            <img src="/landing/SUN.png" alt="太阳" /><span>日</span>
          </Link>
          <div className="earth-system">
            <div className="celestial earth-node" aria-label="地球"><img src="/landing/EARTH.png" alt="地球" /></div>
            <Link className="celestial moon-node" href={PRESET('moon')} aria-label="进入月球望舒课堂">
              <img src="/landing/MOON.png" alt="月球" /><span>月</span>
            </Link>
          </div>
          <Link className="celestial mars-node" href={PRESET('mars')} aria-label="进入火星祝融课堂">
            <img src="/landing/MARS.png" alt="火星" /><span>荧惑</span>
          </Link>
        </div>
      </section>

      <section id="aerospaceView" data-landing-section className="aerospace-view landing-reveal" aria-label="中国现代航天">
        <img src="/landing/bg3.png" alt="" className="aerospace-bg" />
        <Link className="aerospace-moon" href={PRESET('chanye')} aria-label="进入月背工程课堂">
          <img src="/landing/moon3.png" alt="月球" /><span>月背工程</span>
        </Link>
        <Link className="aerospace-rocket" href="/student?preset=rocket" aria-label="进入回收火箭课堂">
          <img src="/landing/huojianhuishou.png" alt="回收火箭" /><span>回收火箭</span>
        </Link>
        <header className="aerospace-header">
          <h1>星途漫漫，中华民族步履不停……</h1>
          <p className="aerospace-copy">羲和驭日而行，嫦娥奔月不归，祝融燃起文明之火，伏羲仰观星象、画出第一张天图——这些名字，从上古神话走入现代航天器的铭牌，成为中华民族向宇宙递出的回答。</p>
        </header>
      </section>

      <section id="pricingView" data-landing-section className="pricing-view landing-reveal" aria-label="定价策略">
        <div className="pricing-inner">
          <header className="pricing-header"><p className="eyebrow">定价策略</p><h1>选择你的星途</h1></header>
          <div className="pricing-grid">
            {[
              ['Luna', '¥99', '解锁基础学习能力', ['核心答题模型', '每日固定讲解额度', '基础错题记录', '学习进度统计']],
              ['Terra', '¥299', '解锁完整学习体验', ['高级答题模型', '更多可视化讲解额度', '更细致的步骤解析', '支持多题型训练', '生成个人学习报告']],
              ['Sol', '¥599', '有效提升学习效率', ['高可视化讲解额度', '更强的复杂题解析能力', '更深度的可视化推演', '个性化学习路径规划', '错题智能重组训练', '阶段性能力评估报告']],
            ].map(([name, price, subtitle, features]) => (
              <article className="pricing-card" key={name as string}>
                <p className="plan-name">{name as string}</p><p className="plan-price">{price as string}</p><p className="plan-sub">{subtitle as string}</p>
                <ul className="plan-features">{(features as string[]).map((feature) => <li key={feature}>{feature}</li>)}</ul>
              </article>
            ))}
          </div>
          <div className="mt-10 flex justify-center"><Link href="/student" className="direct-entry">直接体验</Link></div>
        </div>
      </section>
    </main>
  );
}
